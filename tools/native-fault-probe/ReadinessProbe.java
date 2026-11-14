package app.showcontrol.nativefaultprobe;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.SystemClock;
import android.system.Os;
import java.io.*;
import java.lang.reflect.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;
import org.json.JSONArray;

/** Separate test process instrument. No media writes, transport or production hook. */
public final class ReadinessProbe extends Instrumentation {
  private static final String EXPECTED = "ef235e9eaef2e5e9f27f4d34cd7ceb6f0b82de9b1781b36436c85d32d15adcdb";
  private String token;
  private File control, storageRoot;
  private Object service;
  private Handler commands;
  private Class<?> listenerType;
  private boolean armed;
  private long holdAt, readyAt;
  private int withheld;
  private Object heldVoice, originalListener, proxyListener, heldGate;
  private String heldKey, probeError;

  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("Unique test token required");
    start();
  }

  @Override public void onStart() {
    Bundle result = new Bundle();
    int sequence = 0;
    try {
      if (!getTargetContext().getPackageName().equals("app.showcontrol.working")) throw new SecurityException("Unexpected target");
      storageRoot = getTargetContext().getFilesDir().getCanonicalFile();
      File external = getTargetContext().getExternalFilesDir(null);
      if (external == null) throw new IOException("External test control storage unavailable");
      control = new File(external, "native-readiness-probe-" + token);
      if (!control.mkdirs() && !control.isDirectory()) throw new IOException("Test control directory unavailable");
      writeResult(0, "ready", new JSONObject(), null);
      getTargetContext().startActivity(new Intent().setClassName("app.showcontrol.working", "app.showcontrol.working.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      long end = SystemClock.elapsedRealtime() + 900_000, last = SystemClock.elapsedRealtime();
      while (SystemClock.elapsedRealtime() < end && SystemClock.elapsedRealtime() - last < 300_000) {
        File file = new File(control, "command.json");
        JSONObject request = null;
        if (file.isFile() && file.length() <= 2048) {
          try { request = new JSONObject(new String(read(file, 2048), java.nio.charset.StandardCharsets.UTF_8)); }
          catch (Exception partial) { /* Retry an incomplete control write. */ }
        }
        if (request != null && token.equals(request.optString("token")) && request.optInt("sequence", -1) == sequence + 1) {
          sequence++; last = SystemClock.elapsedRealtime();
          String action = request.optString("action");
          try {
            if (!Arrays.asList("arm", "status", "lateReady", "disarm", "finish").contains(action)) throw new SecurityException("Unknown readiness action");
            JSONObject observation;
            if (action.equals("finish") && (service == null || Boolean.TRUE.equals(get(service, "destroyed")))) {
              armed = false;
              observation = new JSONObject().put("ownerDestroyed", true);
            } else observation = action.equals("arm") ? arm() : onOwner(() -> {
              if (action.equals("lateReady")) replayLateReady();
              if (action.equals("disarm") || action.equals("finish")) removePrinter();
              if (action.equals("finish") && (get(service, "rootAdmission") != null || !map(service, "voices").isEmpty())) throw new IllegalStateException("Stop and exit the synthetic show before finishing");
              return observe();
            });
            writeResult(sequence, action, observation, null);
            if (action.equals("finish")) break;
          } catch (Exception failure) { writeResult(sequence, action, new JSONObject(), failure.toString()); }
        }
        SystemClock.sleep(100);
      }
      if (commands != null && !Boolean.TRUE.equals(get(service, "destroyed"))) onOwner(() -> { removePrinter(); return new JSONObject(); });
      result.putString("result", "finished; no media modified"); finish(0, result);
    } catch (Exception failure) {
      if (commands != null) { try { onOwner(() -> { removePrinter(); return new JSONObject(); }); } catch (Exception cleanup) { failure.addSuppressed(cleanup); } }
      result.putString("error", failure.toString()); finish(1, result);
    }
  }

  private JSONObject arm() throws Exception {
    ClassLoader loader = getTargetContext().getClassLoader();
    Class<?> runtime = Class.forName("app.showcontrol.audio.ShowAudioRuntime", true, loader);
    Object owner = field(runtime, "service").get(null);
    if (owner == null) throw new IllegalStateException("Prepare and start the synthetic outgoing cue first");
    if (service != null && service != owner) throw new IllegalStateException("Owner changed; finish this probe session");
    service = owner; commands = (Handler) get(owner, "commands");
    listenerType = Class.forName("androidx.media3.common.Player$Listener", true, loader);
    return onOwner(() -> {
      if (armed || get(service, "rootAdmission") != null || !map(service, "preparedRootVoices").isEmpty()) throw new IllegalStateException("An admission is already pending");
      Object prepared = get(service, "prepared");
      if (prepared == null || !"oms".equals(get(prepared, "transportMode")) || map(service, "voices").isEmpty()) throw new IllegalStateException("Running OMS QA root required");
      for (Object voice : map(service, "voices").values()) requireQaCue(get(voice, "cue"));
      if (heldVoice != null && map(service, "voices").containsValue(heldVoice)) throw new IllegalStateException("Do not replace an active held voice");
      heldVoice = null; originalListener = null; proxyListener = null; heldGate = null; heldKey = null;
      holdAt = 0; readyAt = 0; withheld = 0; probeError = null; armed = true;
      commands.getLooper().setMessageLogging(line -> {
        if (!armed || !line.startsWith("<<<<<")) return;
        try { captureIncoming(); } catch (Exception failure) { probeError = failure.toString(); removePrinter(); }
      });
      return observe();
    });
  }

  private void captureIncoming() throws Exception {
    Object admission = get(service, "rootAdmission");
    if (admission == null) return;
    Object gate = get(admission, "gate");
    if (!"PREPARING".equals(String.valueOf(get(gate, "phase")))) throw new IllegalStateException("Readiness was not intercepted before admission");
    List<Map.Entry<?, ?>> matches = new ArrayList<>();
    for (Map.Entry<?, ?> entry : map(service, "preparedRootVoices").entrySet()) {
      Object cue = get(entry.getValue(), "cue"); requireQaCue(cue);
      File file = ((File) get(cue, "file")).getCanonicalFile();
      if (file.getName().matches("(?:media-)?" + EXPECTED + "\\.wav")) {
        if (!file.getPath().startsWith(storageRoot.getPath() + File.separator) || !hash(read(file, 2_000_000)).equals(EXPECTED)) throw new SecurityException("Synthetic media identity mismatch");
        matches.add(entry);
      }
    }
    if (matches.size() != 1) throw new SecurityException("Exactly one known incoming synthetic voice required");
    Map.Entry<?, ?> match = matches.get(0);
    Object voice = match.getValue(), player = get(voice, "player");
    Object listeners = get(get(player, "listeners"), "listeners");
    List<Object> owners = new ArrayList<>();
    for (Object holder : (Iterable<?>) listeners) {
      Object listener = get(holder, "listener");
      if (listener.getClass().getName().startsWith("app.showcontrol.audio.ShowAudioService$")) owners.add(listener);
    }
    if (owners.size() != 1) throw new IllegalStateException("Expected one native voice listener");
    heldVoice = voice; heldKey = String.valueOf(match.getKey()); heldGate = gate; originalListener = owners.get(0);
    final Object original = originalListener;
    proxyListener = Proxy.newProxyInstance(listenerType.getClassLoader(), new Class<?>[]{listenerType}, (proxy, method, args) -> {
      if (method.getDeclaringClass() == Object.class) {
        if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
        if (method.getName().equals("equals")) return proxy == args[0];
        return "Synthetic readiness callback gate";
      }
      if (method.getName().equals("onPlaybackStateChanged") && ((Integer) args[0]) == 3) {
        withheld++; readyAt = SystemClock.elapsedRealtime(); return null;
      }
      try { return method.invoke(original, args); } catch (InvocationTargetException error) { throw error.getCause(); }
    });
    Method remove = player.getClass().getMethod("removeListener", listenerType); remove.setAccessible(true); remove.invoke(player, originalListener);
    Method add = player.getClass().getMethod("addListener", listenerType); add.setAccessible(true); add.invoke(player, proxyListener);
    holdAt = SystemClock.elapsedRealtime(); removePrinter();
  }

  private void replayLateReady() throws Exception {
    if (heldVoice == null || withheld == 0 || originalListener == null || heldGate == null) throw new IllegalStateException("No withheld real READY callback");
    String phase = String.valueOf(get(heldGate, "phase"));
    if ((!phase.equals("REFUSED") && !phase.equals("CANCELLED")) || map(service, "preparedRootVoices").containsKey(heldKey) || map(service, "voices").containsKey(heldKey)) throw new IllegalStateException("Late callback requires refused/cancelled and released staging");
    listenerType.getMethod("onPlaybackStateChanged", int.class).invoke(originalListener, 3);
  }

  private void requireQaCue(Object cue) throws Exception {
    if (!((Set<?>) get(cue, "tags")).contains("qa-root-20261024")) throw new SecurityException("Only known QA-tagged cues may be instrumented");
  }
  private void removePrinter() { armed = false; if (commands != null) commands.getLooper().setMessageLogging(null); }

  private JSONObject observe() throws Exception {
    Method state = service.getClass().getDeclaredMethod("runState"); state.setAccessible(true);
    List<String> activeCueIds = new ArrayList<>(), activeVoiceIds = new ArrayList<>();
    for (Map.Entry<?, ?> entry : map(service, "voices").entrySet()) {
      activeVoiceIds.add(String.valueOf(entry.getKey())); activeCueIds.add(String.valueOf(get(get(entry.getValue(), "cue"), "id")));
    }
    Collections.sort(activeCueIds); Collections.sort(activeVoiceIds);
    JSONObject result = new JSONObject().put("state", new JSONObject((Map<?, ?>) state.invoke(service)))
      .put("armed", armed).put("withheldReady", withheld).put("holdAtMs", holdAt).put("readyAtMs", readyAt)
      .put("observedAtMs", SystemClock.elapsedRealtime()).put("stagedVoices", map(service, "preparedRootVoices").size())
      .put("activeVoices", map(service, "voices").size()).put("processors", ((Collection<?>) get(service, "processors")).size())
      .put("queuedActions", ((Collection<?>) get(service, "pendingDelayedActions")).size()).put("reservedVoices", get(service, "reservedVoiceCount"))
      .put("heldForRetry", get(service, "rootHeldForGo")).put("transitioning", get(service, "transitioning"))
      .put("activeCueIds", new JSONArray(activeCueIds)).put("activeVoiceIds", new JSONArray(activeVoiceIds))
      .put("expectedReadyCount", heldGate == null ? 0 : ((Set<?>) get(heldGate, "expected")).size())
      .put("receivedReadyCount", heldGate == null ? 0 : ((Set<?>) get(heldGate, "ready")).size())
      .put("heldPhase", heldGate == null ? JSONObject.NULL : String.valueOf(get(heldGate, "phase")))
      .put("admissionPresent", get(service, "rootAdmission") != null).put("probeError", probeError == null ? JSONObject.NULL : probeError);
    return result;
  }
  private interface Observation { JSONObject run() throws Exception; }
  private JSONObject onOwner(Observation work) throws Exception {
    if (commands == null) throw new IllegalStateException("Arm the probe after preparation first");
    CountDownLatch done = new CountDownLatch(1); JSONObject[] value = new JSONObject[1]; Exception[] failure = new Exception[1];
    AtomicBoolean pending = new AtomicBoolean(true);
    Runnable observation = () -> { if (!pending.compareAndSet(true, false)) return; try { value[0] = work.run(); } catch (Exception error) { failure[0] = error; } finally { done.countDown(); } };
    if (!commands.post(observation)) throw new IllegalStateException("Owner queue stopped");
    if (!done.await(3, TimeUnit.SECONDS)) { pending.set(false); commands.removeCallbacks(observation); throw new IllegalStateException("Owner observation pending; reconcile this session"); }
    if (failure[0] != null) throw failure[0]; return value[0];
  }
  private static Field field(Class<?> type, String name) throws Exception {
    for (Class<?> current = type; current != null; current = current.getSuperclass()) {
      try { Field field = current.getDeclaredField(name); field.setAccessible(true); return field; } catch (NoSuchFieldException absent) { /* Inspect the superclass. */ }
    }
    throw new NoSuchFieldException(name);
  }
  private static Object get(Object object, String name) throws Exception { return field(object.getClass(), name).get(object); }
  private static Map<?, ?> map(Object object, String name) throws Exception { return (Map<?, ?>) get(object, name); }
  private static byte[] read(File file, int maximum) throws Exception {
    if (!file.isFile() || file.length() > maximum) throw new IOException("Bounded input required");
    try (InputStream stream = new FileInputStream(file); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      byte[] block = new byte[16384]; int count;
      while ((count = stream.read(block)) != -1) { if (bytes.size() + count > maximum) throw new IOException("Input too large"); bytes.write(block, 0, count); }
      return bytes.toByteArray();
    }
  }
  private static String hash(byte[] bytes) throws Exception {
    StringBuilder text = new StringBuilder(); for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) text.append(String.format(Locale.ROOT, "%02x", value & 255)); return text.toString();
  }
  private void writeResult(int sequence, String action, JSONObject observation, String error) throws Exception {
    JSONObject result = new JSONObject().put("token", token).put("sequence", sequence).put("action", action).put("success", error == null).put("observation", observation);
    if (error != null) result.put("error", error);
    File temporary = new File(control, "result.tmp"), destination = new File(control, "result.json");
    try (FileOutputStream stream = new FileOutputStream(temporary)) { stream.write(result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); stream.getFD().sync(); }
    Os.rename(temporary.getAbsolutePath(), destination.getAbsolutePath());
  }
}
