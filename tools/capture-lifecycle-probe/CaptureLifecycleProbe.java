package app.showcontrol.capturelifecycleprobe;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.view.Window;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Separate main-queue ownership regression; no audio, profile or input dispatch. */
public final class CaptureLifecycleProbe extends Instrumentation {
  private volatile Activity activity;
  private String token;
  private interface Step { void run() throws Exception; }
  private void onMain(Step action) throws Exception {
    AtomicReference<Throwable> failure = new AtomicReference<Throwable>();
    runOnMainSync(() -> { try { action.run(); } catch (Throwable error) { failure.set(error); } });
    if (failure.get() != null) throw new Exception("Main-queue probe step failed", failure.get());
  }
  @Override public void onCreate(Bundle args) {
    super.onCreate(args); token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Fresh QA token required");
    start();
  }
  @Override public void callActivityOnResume(Activity next) {
    super.callActivityOnResume(next);
    if ("app.showcontrol.working".equals(next.getPackageName())) activity = next;
  }
  private boolean listening(Object capture, Class<?> type) throws Exception {
    return Boolean.TRUE.equals(((Map<?, ?>)type.getMethod("health").invoke(capture)).get("genericKeyboardListening"));
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    Context context = getTargetContext();
    Object capture = null; Class<?> captureType = null;
    boolean success = false, lateStop = false, lateSuspend = false, stopped = false, restored = false;
    AtomicReference<Window.Callback> original = new AtomicReference<Window.Callback>();
    try {
      if (!"app.showcontrol.working".equals(context.getPackageName())) throw new SecurityException("Unexpected target");
      ClassLoader loader = context.getClassLoader();
      Class<?> coordinator = Class.forName("app.showcontrol.audio.NativeRemoteCoordinator", true, loader);
      if (coordinator.getMethod("captureIdleEpoch").invoke(coordinator.getField("INSTANCE").get(null)) == null) throw new IllegalStateException("Preserve native ownership; begin idle only");
      context.startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setClassName(context.getPackageName(), context.getPackageName()+".MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      long deadline = SystemClock.elapsedRealtime()+60000;
      while (activity == null && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
      if (activity == null) throw new IllegalStateException("Target activity did not resume");
      captureType = Class.forName("app.showcontrol.controller.HardwareKeyCapture", true, loader);
      java.lang.reflect.Constructor<?> constructor = captureType.getDeclaredConstructor(); constructor.setAccessible(true);
      capture = constructor.newInstance();
      final Object owned = capture;
      final Class<?> ownedType = captureType;
      final Method start = ownedType.getMethod("start", Activity.class), stop = ownedType.getMethod("stop"), suspend = ownedType.getMethod("suspend");
      onMain(() -> { original.set(activity.getWindow().getCallback()); start.invoke(owned, activity); });
      // runOnUiThread executes inline here; the earlier Handler cleanup cannot
      // run until this main turn completes. The next onMain drains that cleanup.
      onMain(() -> { stop.invoke(owned); start.invoke(owned, activity); });
      onMain(() -> {});
      lateStop = listening(owned, ownedType);
      onMain(() -> stop.invoke(owned)); onMain(() -> {});
      onMain(() -> start.invoke(owned, activity));
      onMain(() -> { suspend.invoke(owned); start.invoke(owned, activity); });
      onMain(() -> {});
      lateSuspend = listening(owned, ownedType);
    } catch (Exception error) { result.putString("error", error.toString()); }
    finally {
      try {
        final Object owned = capture; final Class<?> ownedType = captureType;
        if (owned != null) {
          onMain(() -> ownedType.getMethod("stop").invoke(owned)); onMain(() -> {});
          stopped = !listening(owned, ownedType);
          AtomicReference<Boolean> callbackRestored = new AtomicReference<Boolean>();
          onMain(() -> callbackRestored.set(activity.getWindow().getCallback() == original.get()));
          restored = Boolean.TRUE.equals(callbackRestored.get());
        }
        success = lateStop && lateSuspend && stopped && restored && !result.containsKey("error");
        JSONObject evidence = new JSONObject().put("token", token).put("lateStopSurvived", lateStop).put("lateSuspendSurvived", lateSuspend)
          .put("finalStopConfirmed", stopped).put("originalCallbackRestored", restored).put("success", success)
          .put("transportCommands", 0).put("profileChanges", 0).put("audioPreparations", 0).put("recordedAtMs", System.currentTimeMillis());
        if (result.containsKey("error")) evidence.put("error", result.getString("error"));
        AtomicFile file = new AtomicFile(new File(context.getExternalFilesDir(null), "capture-lifecycle-"+token+".json"));
        FileOutputStream output = file.startWrite();
        try { output.write(evidence.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
        catch (Exception error) { file.failWrite(output); throw error; }
        result.putString("result", evidence.toString());
      } catch (Exception error) { result.putString("cleanupError", error.toString()); success = false; }
      finish(success ? 0 : 1, result);
    }
  }
}
