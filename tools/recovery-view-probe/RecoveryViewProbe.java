package app.showcontrol.recoveryviewprobe;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Separate synthetic QA instrument. No DB, media, keys, SDK or transport access. */
public final class RecoveryViewProbe extends Instrumentation {
  private volatile Activity activity;
  private String token;
  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Unique QA token required");
    start();
  }
  @Override public void callActivityOnResume(Activity next) {
    super.callActivityOnResume(next);
    if ("app.showcontrol.working".equals(next.getPackageName())) activity = next;
  }
  private int[] observe() {
    final AtomicReference<int[]> result = new AtomicReference<int[]>();
    final AtomicReference<RuntimeException> failure = new AtomicReference<RuntimeException>();
    runOnMainSync(new Runnable() { public void run() {
      try {
        Activity current = activity;
        if (current == null || current.isFinishing() || current.isDestroyed()) { result.set(new int[4]); return; }
        int[] counts = new int[4]; count(current.getWindow().getDecorView(), counts); result.set(counts);
      } catch (RuntimeException error) { failure.set(error); }
    }});
    if (failure.get() != null) throw failure.get();
    return result.get();
  }
  private void count(View view, int[] counts) {
    if (++counts[0] > 100000) throw new IllegalStateException("Unexpected view count");
    // Native text inputs can contain private drafts or keys. Never inspect them.
    if (view instanceof TextView && !(view instanceof EditText)) {
      String value = ((TextView)view).getText().toString();
      if (value.matches("QA Rehearsal song [0-9]{4}")) counts[1]++;
      if (view.isShown() && value.equals("Recovery")) counts[2]++;
      if (view.isShown() && value.equals("Your shows")) counts[3]++;
    }
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup)view;
      for (int index = 0; index < group.getChildCount(); index++) count(group.getChildAt(index), counts);
    }
  }
  private void write(String phase, JSONObject value) throws Exception {
    value.put("token", token).put("phase", phase).put("recordedAtMs", System.currentTimeMillis());
    AtomicFile file = new AtomicFile(new File(getTargetContext().getExternalFilesDir(null), "recovery-view-" + token + "-" + phase + ".json"));
    FileOutputStream output = file.startWrite();
    try { output.write(value.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
    catch (Exception error) { file.failWrite(output); throw error; }
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      if (!"app.showcontrol.working".equals(getTargetContext().getPackageName())) throw new SecurityException("Unexpected target");
      write("ready", new JSONObject().put("awaiting", "deliberately prepared synthetic Recovery"));
      getTargetContext().startActivity(new Intent().setClassName("app.showcontrol.working", "app.showcontrol.working.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      long deadline = SystemClock.elapsedRealtime() + 360000, firstRecovery = 0;
      int[] previous = null, measured = null; int stable = 0;
      while (SystemClock.elapsedRealtime() < deadline) {
        int[] current = observe();
        if (current[2] > 0 && current[1] > 0) {
          if (firstRecovery == 0) firstRecovery = SystemClock.elapsedRealtime();
          stable = Arrays.equals(previous, current) ? stable + 1 : 0;
          if (stable >= 3 && SystemClock.elapsedRealtime() - firstRecovery >= 1500) { measured = current; break; }
        } else { firstRecovery = 0; stable = 0; }
        previous = current; SystemClock.sleep(350);
      }
      if (measured == null) throw new IllegalStateException("Recovery observation deadline; do not restart a live observer");
      write("measured", new JSONObject().put("mountedNativeViews", measured[0]).put("syntheticCueTextViews", measured[1]).put("visibleRecoveryLabels", measured[2]).put("readOnlyMeasurement", true));
      deadline = SystemClock.elapsedRealtime() + 360000;
      boolean exited = false;
      while (SystemClock.elapsedRealtime() < deadline) {
        int[] current = observe();
        if (current[2] == 0 && current[3] > 0) { exited = true; break; }
        SystemClock.sleep(350);
      }
      if (!exited) throw new IllegalStateException("Await deliberate Exit to Library before finishing");
      write("idle", new JSONObject().put("libraryObserved", true).put("transportCommands", 0));
      result.putString("result", "Read-only Recovery view count; deliberate Library return observed");
      finish(0, result);
    } catch (Exception error) {
      try { write("failure", new JSONObject().put("error", error.toString())); } catch (Exception ignored) {}
      result.putString("error", error.toString()); finish(1, result);
    }
  }
}
