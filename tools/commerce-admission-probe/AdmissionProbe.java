package app.showcontrol.commerceadmissionprobe;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.Looper;
import android.os.SystemClock;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.*;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** QA instrument: actual admission only. No store call, receipt access, media write or transport command. */
public final class AdmissionProbe extends Instrumentation {
  private String token;
  private ClassLoader loader;
  private Class<?> coordinator;
  private Object remote;

  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("Unique QA token required");
    start();
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      if (!getTargetContext().getPackageName().equals("app.showcontrol.working")) throw new SecurityException("Unexpected target");
      loader = getTargetContext().getClassLoader();
      coordinator = Class.forName("app.showcontrol.audio.NativeRemoteCoordinator", true, loader);
      remote = coordinator.getField("INSTANCE").get(null);
      write("ready", new JSONObject().put("awaiting", "silent preparation"));
      getTargetContext().startActivity(new Intent().setClassName("app.showcontrol.working", "app.showcontrol.working.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      waitForArmed(true);
      write("critical", inspect(true));
      waitForArmed(false);
      write("idle", inspect(false));
      result.putString("result", "critical rejection and idle admission verified; no SDK operation");
      finish(0, result);
    } catch (Exception error) {
      try { write("failure", new JSONObject().put("error", error.toString())); } catch (Exception ignored) {}
      result.putString("error", error.toString()); finish(1, result);
    }
  }
  private boolean armed() throws Exception { return Boolean.TRUE.equals(coordinator.getMethod("isArmed").invoke(remote)); }
  private void waitForArmed(boolean expected) throws Exception {
    long end = SystemClock.elapsedRealtime() + 360_000;
    while (armed() != expected) {
      if (SystemClock.elapsedRealtime() >= end) throw new IllegalStateException("QA phase deadline; inspect the same process before retrying");
      SystemClock.sleep(100);
    }
  }
  private JSONObject inspect(boolean expectedArmed) throws Exception {
    AtomicReference<JSONObject> output = new AtomicReference<>();
    AtomicReference<Throwable> failure = new AtomicReference<>();
    runOnMainSync(() -> {
      try {
        if (Looper.myLooper() != Looper.getMainLooper() || armed() != expectedArmed) throw new IllegalStateException("QA phase changed");
        Object beforeEpoch = coordinator.getMethod("commandEpoch", String.class).invoke(remote, "ADMISSION_PROBE");
        Class<?> type = Class.forName("app.showcontrol.commerce.ShowCommerceModule", true, loader);
        Object module = type.getConstructor().newInstance();
        Class<?> promiseType = Class.forName("expo.modules.kotlin.Promise", true, loader);
        Class<?> workType = Class.forName("kotlin.jvm.functions.Function1", true, loader);
        int[] resolves = {0}, rejects = {0}, workCalls = {0}; String[] errorCode = {null};
        Object promise = Proxy.newProxyInstance(loader, new Class<?>[]{promiseType}, (proxy, method, args) -> {
          if (method.getName().equals("resolve")) resolves[0]++;
          if (method.getName().equals("reject")) { rejects[0]++; errorCode[0] = String.valueOf(args[0]); }
          return null;
        });
        Object work = Proxy.newProxyInstance(loader, new Class<?>[]{workType}, (proxy, method, args) -> {
          if (method.getName().equals("invoke")) {
            workCalls[0]++;
            Method resolve = args[0].getClass().getDeclaredMethod("resolve", Object.class); resolve.setAccessible(true);
            resolve.invoke(args[0], new Object[]{null});
          }
          return Class.forName("kotlin.Unit", true, loader).getField("INSTANCE").get(null);
        });
        Method admit = type.getDeclaredMethod("admit", promiseType, boolean.class, boolean.class, workType); admit.setAccessible(true);
        admit.invoke(module, promise, true, true, work);
        Field client = type.getDeclaredField("billingClient"); client.setAccessible(true);
        Field requests = type.getDeclaredField("requests"); requests.setAccessible(true);
        if (client.get(module) != null || !((Map<?, ?>) requests.get(module)).isEmpty()) throw new IllegalStateException("Probe left SDK ownership or a pending request");
        Object afterEpoch = coordinator.getMethod("commandEpoch", String.class).invoke(remote, "ADMISSION_PROBE");
        if (!java.util.Objects.equals(beforeEpoch, afterEpoch)) throw new IllegalStateException("Admission changed the audio command epoch");
        if (expectedArmed ? rejects[0] != 1 || resolves[0] != 0 || workCalls[0] != 0 || !"E_STORE_SHOW_ACTIVE".equals(errorCode[0])
                          : rejects[0] != 0 || resolves[0] != 1 || workCalls[0] != 1) throw new IllegalStateException("Unexpected admission result");
        output.set(new JSONObject().put("nativeArmed", expectedArmed).put("mainThread", true).put("resolves", resolves[0])
          .put("rejects", rejects[0]).put("workCalls", workCalls[0]).put("errorCode", errorCode[0]).put("billingClientCreated", false)
          .put("pendingRequests", 0).put("audioEpochUnchanged", true));
      } catch (Throwable error) { failure.set(error); }
    });
    if (failure.get() != null) throw new IllegalStateException("Actual admission probe failed", failure.get());
    return output.get();
  }
  private void write(String phase, JSONObject value) throws Exception {
    File root = getTargetContext().getExternalFilesDir(null);
    if (root == null) throw new IllegalStateException("QA output unavailable");
    AtomicFile file = new AtomicFile(new File(root, "native-commerce-admission-" + token + "-" + phase + ".json"));
    byte[] data = value.put("token", token).put("phase", phase).put("recordedAtMs", System.currentTimeMillis()).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    FileOutputStream stream = file.startWrite();
    try { stream.write(data); file.finishWrite(stream); } catch (Exception error) { file.failWrite(stream); throw error; }
  }
}
