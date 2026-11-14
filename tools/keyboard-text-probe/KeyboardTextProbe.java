package app.showcontrol.keyboardtextprobe;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.view.ViewGroup;
import android.view.View;
import android.widget.EditText;
import android.widget.FrameLayout;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/** Isolated native admission QA. No real audio preparation, library or provider access. */
public final class KeyboardTextProbe extends Instrumentation {
  private volatile Activity activity;
  private String token;
  private final AtomicInteger rawInputs = new AtomicInteger(), commands = new AtomicInteger();
  @Override public void onCreate(Bundle args) {
    super.onCreate(args); token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Fresh QA token required");
    start();
  }
  @Override public void callActivityOnResume(Activity next) {
    super.callActivityOnResume(next);
    if ("app.showcontrol.working".equals(next.getPackageName())) activity = next;
  }
  private static void check(boolean value, String message) { if (!value) throw new IllegalStateException(message); }
  private void waitCount(AtomicInteger counter, int expected) {
    long deadline = SystemClock.elapsedRealtime() + 3000;
    while (counter.get() < expected && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(20);
    check(counter.get() == expected, "Unexpected native command/event count");
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    Object runtime = null, capture = null, observer = null;
    Class<?> coordinator = null, runtimeClass = null, captureClass = null, observerClass = null;
    String originalProfile = null;
    FrameLayout container = null;
    Context context = getTargetContext();
    BroadcastReceiver receiver = null;
    boolean receiverRegistered = false, syntheticArmed = false, success = false;
    try {
      check("app.showcontrol.working".equals(context.getPackageName()), "Unexpected target");
      ClassLoader loader = context.getClassLoader();
      coordinator = Class.forName("app.showcontrol.audio.NativeRemoteCoordinator", true, loader);
      final Object nativeCoordinator = coordinator.getField("INSTANCE").get(null);
      check(coordinator.getMethod("captureIdleEpoch").invoke(nativeCoordinator) != null, "Start only with idle native admission");
      context.startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        .setClassName(context.getPackageName(), context.getPackageName() + ".MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      long deadline = SystemClock.elapsedRealtime() + 60000;
      while (activity == null && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
      check(activity != null, "Activity did not resume");
      check(coordinator.getMethod("captureIdleEpoch").invoke(nativeCoordinator) != null, "Native admission changed; preserve it");
      runtimeClass = Class.forName("app.showcontrol.controller.ShowControllerRuntime", true, loader);
      runtime = runtimeClass.getField("INSTANCE").get(null);
      // Idle Library intentionally does not start/configure controller capture.
      // This only supplies the app context and ephemeral defaults, without
      // starting a Flic manager/service or preparing any actual audio.
      runtimeClass.getMethod("configure", Context.class, long.class, boolean.class).invoke(runtime, context, 15000L, false);
      java.lang.reflect.Field bindings = runtimeClass.getDeclaredField("bindings"); bindings.setAccessible(true);
      originalProfile = new JSONObject().put("bindings", new JSONArray((List<?>)bindings.get(runtime))).toString();
      final String device = "keyboard-text-" + token;
      JSONArray assigned = new JSONArray();
      for (String[] pair : new String[][]{{"KEYCODE_SPACE", "GO"}, {"KEYCODE_ENTER", "PANIC_FADE"}, {"KEYCODE_ESCAPE", "STOP_ALL"}})
        assigned.put(new JSONObject().put("adapterId", "generic-native").put("deviceId", device).put("inputKey", pair[0]).put("command", new JSONObject().put("type", pair[1])));
      runtimeClass.getMethod("configureProfile", String.class).invoke(runtime, new JSONObject().put("bindings", assigned).toString());
      observerClass = Class.forName("app.showcontrol.controller.ShowControllerRuntime$Observer", true, loader);
      observer = Proxy.newProxyInstance(loader, new Class<?>[]{observerClass}, (proxy, method, args) -> {
        if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
        if (method.getName().equals("equals")) return proxy == args[0];
        if (method.getName().equals("toString")) return "KeyboardTextQaObserver";
        if (method.getName().equals("onInput") && args[0] instanceof Map && device.equals(((Map<?, ?>)args[0]).get("deviceId"))) rawInputs.incrementAndGet();
        return null;
      });
      runtimeClass.getMethod("addObserver", observerClass).invoke(runtime, observer);
      receiver = new BroadcastReceiver() { @Override public void onReceive(Context ignored, Intent intent) {
        try { JSONObject command = new JSONObject(intent.getStringExtra("command"));
          if (command.has("controllerEpoch") && command.has("eventId")) commands.incrementAndGet();
        } catch (Exception error) { commands.set(-100); }
      }};
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, new IntentFilter("app.showcontrol.SEMANTIC_COMMAND"), Context.RECEIVER_NOT_EXPORTED);
      else context.registerReceiver(receiver, new IntentFilter("app.showcontrol.SEMANTIC_COMMAND"));
      receiverRegistered = true;
      captureClass = Class.forName("app.showcontrol.controller.HardwareKeyCapture", true, loader);
      java.lang.reflect.Constructor<?> constructor = captureClass.getDeclaredConstructor(); constructor.setAccessible(true);
      capture = constructor.newInstance();
      captureClass.getMethod("start", Activity.class).invoke(capture, activity);
      final EditText qaField = new EditText(activity);
      final FrameLayout qaContainer = new FrameLayout(activity); container = qaContainer;
      final View neutral = new View(activity);
      runOnMainSync(() -> {
        qaField.setSingleLine(true); qaField.setShowSoftInputOnFocus(false); qaField.setHint("Synthetic keyboard focus QA");
        neutral.setFocusable(true); neutral.setFocusableInTouchMode(true);
        qaContainer.addView(qaField, new FrameLayout.LayoutParams(400, 100));
        qaContainer.addView(neutral, new FrameLayout.LayoutParams(1, 1));
        ((ViewGroup)activity.findViewById(android.R.id.content)).addView(qaContainer, new FrameLayout.LayoutParams(400, 100));
        qaField.requestFocus();
        check(activity.getCurrentFocus() == qaField, "Synthetic text editor did not receive native focus");
      });
      coordinator.getMethod("setArmed", boolean.class).invoke(nativeCoordinator, true); syntheticArmed = true;
      Method forward = captureClass.getMethod("forwardGenericInput", String.class, String.class, String.class, boolean.class);
      forward.invoke(capture, device, "KEYCODE_SPACE", "down", false);
      check(rawInputs.get() == 0 && commands.get() == 0, "Typing reached bridge/history or native command broadcast");
      runOnMainSync(() -> { neutral.requestFocus(); check(activity.getCurrentFocus() == neutral, "Neutral native focus missing"); });
      forward.invoke(capture, device, "KEYCODE_SPACE", "down", true);
      forward.invoke(capture, device, "KEYCODE_SPACE", "up", false);
      check(rawInputs.get() == 0 && commands.get() == 0, "Held typing crossed focus boundary");
      forward.invoke(capture, device, "KEYCODE_SPACE", "down", false);
      waitCount(commands, 1); check(rawInputs.get() == 1, "Fresh released key did not return to controller ownership");
      forward.invoke(capture, device, "KEYCODE_SPACE", "up", false);
      runOnMainSync(() -> { qaField.requestFocus(); check(activity.getCurrentFocus() == qaField, "Text focus missing"); });
      forward.invoke(capture, device, "KEYCODE_ENTER", "down", false);
      waitCount(commands, 2);
      forward.invoke(capture, device, "KEYCODE_ENTER", "up", false);
      forward.invoke(capture, device, "KEYCODE_ESCAPE", "down", false);
      waitCount(commands, 3);
      forward.invoke(capture, device, "KEYCODE_ESCAPE", "up", false);
      success = true;
      result.putString("result", "Native focused typing and held keys suppressed; fresh GO and assigned panic/stop admitted to isolated receiver");
    } catch (Exception error) { result.putString("error", error.toString()); }
    finally {
      try {
        if (syntheticArmed) coordinator.getMethod("setArmed", boolean.class).invoke(coordinator.getField("INSTANCE").get(null), false);
        if (capture != null) captureClass.getMethod("stop").invoke(capture);
        final FrameLayout remove = container;
        if (remove != null) runOnMainSync(() -> { if (remove.getParent() instanceof ViewGroup) ((ViewGroup)remove.getParent()).removeView(remove); });
        if (observer != null) runtimeClass.getMethod("removeObserver", observerClass).invoke(runtime, observer);
        if (originalProfile != null) runtimeClass.getMethod("configureProfile", String.class).invoke(runtime, originalProfile);
        if (receiverRegistered) context.unregisterReceiver(receiver);
        JSONObject evidence = new JSONObject().put("token", token).put("success", success).put("commandBroadcasts", commands.get())
          .put("rawQaInputs", rawInputs.get()).put("actualAudioPreparations", 0).put("syntheticAdmissionOnly", true)
          .put("profileRestored", originalProfile != null).put("recordedAtMs", System.currentTimeMillis());
        if (!success) evidence.put("error", result.getString("error", "Unknown test error"));
        AtomicFile file = new AtomicFile(new File(context.getExternalFilesDir(null), "keyboard-text-" + token + ".json"));
        FileOutputStream output = file.startWrite();
        try { output.write(evidence.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
        catch (Exception error) { file.failWrite(output); throw error; }
      } catch (Exception error) { result.putString("cleanupError", error.toString()); success = false; }
      finish(success ? 0 : 1, result);
    }
  }
}
