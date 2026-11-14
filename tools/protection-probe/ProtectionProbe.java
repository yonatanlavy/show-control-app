package app.showcontrol.protectionprobe;

import android.app.ActivityManager;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/** Separate same-test-signer QA. No library, media, keys or transport access. */
public final class ProtectionProbe extends Instrumentation {
  private String token;
  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Unique QA token required");
    start();
  }
  private static boolean flag(int mask, int bit) { return (mask & (1 << bit)) != 0; }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      Context context = getTargetContext();
      if (!"app.showcontrol.working".equals(context.getPackageName())) throw new SecurityException("Unexpected target");
      ClassLoader loader = context.getClassLoader();
      Class<?> observer = Class.forName("app.showcontrol.audio.BackgroundReliability", true, loader);
      Method read = observer.getDeclaredMethod("read", Context.class, boolean.class, Boolean.class, boolean.class);
      read.setAccessible(true);
      Map<?, ?> status = (Map<?, ?>)read.invoke(observer.getField("INSTANCE").get(null), context, false, Boolean.FALSE, false);
      ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
      ((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
      if (!(status.get("systemLowMemory") instanceof Boolean) || !Boolean.valueOf(memory.lowMemory).equals(status.get("systemLowMemory")))
        throw new IllegalStateException("Native current observation unavailable or changed during independent read");
      Class<?> policy = Class.forName("app.showcontrol.audio.BackgroundSessionPolicyKt", true, loader);
      Method bodies = policy.getDeclaredMethod("backgroundNotificationBodies", Boolean.class, Boolean.class, Boolean.class,
        boolean.class, boolean.class, Integer.class, Boolean.class, String.class, Boolean.class, Boolean.class);
      bodies.setAccessible(true);
      int cases = 0;
      for (int mask = 0; mask < 128; mask++) for (Boolean low : new Boolean[] { Boolean.TRUE, Boolean.FALSE, null }) {
        List<String> expected = new ArrayList<String>();
        if (flag(mask, 0)) expected.add("RECOVERY");
        if (flag(mask, 1)) expected.add("HEAT");
        if (flag(mask, 2)) expected.add("LOW_BATTERY");
        if (Boolean.TRUE.equals(low)) expected.add("MEMORY");
        if (flag(mask, 3) || flag(mask, 4) || flag(mask, 5)) expected.add("BATTERY_WARNING");
        if (expected.isEmpty()) expected.add(flag(mask, 6) ? "ACTIVE" : "PREPARED");
        List<?> raw = (List<?>)bodies.invoke(null, !flag(mask, 3), flag(mask, 4), flag(mask, 5), flag(mask, 0), flag(mask, 6),
          flag(mask, 2) ? 5 : 80, false, flag(mask, 1) ? "critical" : "normal", false, low);
        List<String> actual = new ArrayList<String>();
        for (Object entry : raw) actual.add(((Enum<?>)entry).name());
        if (!expected.equals(actual)) throw new IllegalStateException("Packaged policy failed: " + mask + "/" + low);
        cases++;
      }
      JSONObject evidence = new JSONObject().put("token", token).put("recordedAtMs", System.currentTimeMillis())
        .put("currentLowMemory", memory.lowMemory).put("nativeObservationMatches", true).put("packagedPolicyCases", cases)
        .put("batteryOptimizationIgnored", status.get("batteryOptimizationIgnored")).put("backgroundRestricted", status.get("backgroundRestricted"))
        .put("powerSaveMode", status.get("powerSaveMode")).put("transportCommands", 0).put("libraryReads", 0);
      AtomicFile file = new AtomicFile(new File(context.getExternalFilesDir(null), "protection-probe-" + token + ".json"));
      FileOutputStream output = file.startWrite();
      try { output.write(evidence.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
      catch (Exception error) { file.failWrite(output); throw error; }
      result.putString("result", evidence.toString());
      finish(0, result);
    } catch (Exception error) { result.putString("error", error.toString()); finish(1, result); }
  }
}
