package app.showcontrol.downloadcompletionprobe;

import android.app.Instrumentation;
import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import java.io.*;
import java.lang.reflect.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentMap;
import org.json.*;

/** Separate instrument. Never launches React or a downloader; only starts a bounded idle-cancel service case. */
public final class DownloadCompletionProbe extends Instrumentation {
  private static final Set<String> TERMINAL = new HashSet<>(Arrays.asList("ready", "attached", "cancelled", "error", "interrupted"));
  private Bundle arguments;
  private Context context;
  private Object runtime;
  private Map<String, JSONObject> records;
  private Map<String, Object> processes, cancellations;
  private File root, jobsFile;
  private String token, beforeDigest, afterDigest, scenario, idleId;
  private long deadline;
  private long idleStartMs;
  private Object idleCancellation;
  private boolean idleServiceStarted, idleCancelLeaked, idleStopRequested, idleServiceRemoved;
  private Intent idleIntent;
  private boolean claimed, originalJobsFileExisted;
  private final LinkedHashMap<String, JSONObject> originals = new LinkedHashMap<>();
  private final LinkedHashMap<String, Fixture> fixtures = new LinkedHashMap<>();
  private final List<String> passed = new ArrayList<>();
  private final JSONArray observations = new JSONArray();
  private final JSONArray serviceObservations = new JSONArray();

  private static final class Fixture {
    String id, audioHash, markerHash;
    JSONObject job;
    File directory, audio, marker;
    Object cancellation;
    boolean recordAdded, removed;
  }

  @Override public void onCreate(Bundle args) { arguments = args; start(); }
  private static void check(boolean condition, String message) { if (!condition) throw new IllegalStateException(message); }
  private void budget() { check(SystemClock.elapsedRealtime() < deadline, "Probe deadline reached; preserve evidence"); }
  private static String hex(byte[] values) {
    StringBuilder result = new StringBuilder();
    for (byte value : values) result.append(String.format(Locale.ROOT, "%02X", value));
    return result.toString();
  }
  private static String hash(File file, long limit) throws Exception {
    check(file.isFile() && file.length() <= limit, "Unexpected checksum input");
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[65536]; int count;
      while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
    }
    return hex(digest.digest());
  }
  private static String canonical(Object value, int depth) throws Exception {
    check(depth <= 8, "Unsupported original metadata depth; preserve it");
    if (value == null || value == JSONObject.NULL) return "null";
    if (value instanceof JSONObject) {
      JSONObject object = (JSONObject)value; List<String> keys = new ArrayList<>();
      Iterator<String> iterator = object.keys(); while (iterator.hasNext()) keys.add(iterator.next()); Collections.sort(keys);
      StringBuilder text = new StringBuilder("{"); boolean first = true;
      for (String key : keys) { if (!first) text.append(','); first = false; text.append(JSONObject.quote(key)).append(':').append(canonical(object.get(key), depth + 1)); }
      return text.append('}').toString();
    }
    if (value instanceof JSONArray) {
      JSONArray array = (JSONArray)value; StringBuilder text = new StringBuilder("[");
      for (int i = 0; i < array.length(); i++) { if (i > 0) text.append(','); text.append(canonical(array.get(i), depth + 1)); }
      return text.append(']').toString();
    }
    if (value instanceof String) return JSONObject.quote((String)value);
    if (value instanceof Boolean) return value.toString();
    if (value instanceof Number) return JSONObject.numberToString((Number)value);
    throw new IllegalStateException("Unsupported original metadata value; preserve it");
  }
  private static String digest(JSONArray jobs) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(canonical(jobs, 0).getBytes("UTF-8"))); }
  private JSONArray persisted() throws Exception {
    check(!new File(root, "jobs.json.bak").exists() && !new File(root, "jobs.json.new").exists(), "AtomicFile work exists; preserve it");
    if (!jobsFile.exists()) return new JSONArray();
    check(jobsFile.isFile() && jobsFile.getCanonicalFile().equals(jobsFile.getAbsoluteFile()) && jobsFile.getCanonicalFile().getParentFile().equals(root) && jobsFile.length() < 2_000_000, "Unexpected jobs metadata; preserve it");
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (InputStream input = new FileInputStream(jobsFile)) { byte[] buffer = new byte[8192]; int count; while ((count = input.read(buffer)) != -1) { check(bytes.size() + count < 2_000_000, "Jobs metadata exceeded limit"); bytes.write(buffer, 0, count); } }
    return new JSONArray(bytes.toString("UTF-8"));
  }
  private Object field(String name) throws Exception { Field field = runtime.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(runtime); }
  private static Method metadataMethod(Class<?> owner, String name, Object... args) {
    List<Method> exact = new ArrayList<>(), mangled = new ArrayList<>();
    for (Method method : owner.getDeclaredMethods()) {
      if (Modifier.isStatic(method.getModifiers()) || method.isSynthetic()) continue;
      Class<?>[] types = method.getParameterTypes(); if (types.length != args.length) continue;
      boolean compatible = true;
      for (int i = 0; i < types.length; i++) if (args[i] == null ? types[i].isPrimitive() : !types[i].isInstance(args[i])) { compatible = false; break; }
      if (!compatible) continue;
      if (method.getName().equals(name)) exact.add(method);
      else if (method.getName().startsWith(name + "$")) {
        String suffix = method.getName().substring(name.length() + 1);
        // A single module suffix is valid Kotlin mangling. Lambda/default
        // helpers are static/synthetic or contain another '$' delimiter.
        if (suffix.matches("[A-Za-z_][A-Za-z0-9_]*")) mangled.add(method);
      }
    }
    List<Method> selected = exact.isEmpty() ? mangled : exact;
    check(selected.size() == 1, "Native metadata boundary changed: " + name);
    return selected.get(0);
  }
  private Object invoke(String name, Object... args) throws Exception {
    budget(); Method method = metadataMethod(runtime.getClass(), name, args);
    try { method.setAccessible(true); return method.invoke(runtime, args); }
    catch (InvocationTargetException failure) { Throwable cause = failure.getCause(); if (cause instanceof Exception) throw (Exception)cause; throw new IllegalStateException("Native metadata invocation failed", cause); }
  }
  private void idle() throws Exception {
    check(Boolean.FALSE.equals(field("searching")) && processes.isEmpty(), "Downloader work appeared; preserve it");
    for (String id : cancellations.keySet()) check(fixtures.containsKey(id) || id.equals(idleId), "Foreign cancellation appeared; preserve it");
  }
  private void originalsUnchanged() throws Exception {
    idle(); JSONArray current = new JSONArray();
    for (Map.Entry<String, JSONObject> entry : records.entrySet()) {
      if (fixtures.containsKey(entry.getKey())) continue;
      check(originals.get(entry.getKey()) == entry.getValue(), "Original record identity changed; preserve it"); current.put(entry.getValue());
    }
    check(digest(current).equals(beforeDigest), "Original jobs changed; preserve evidence");
  }
  @SuppressWarnings("unchecked") private void claim() throws Exception {
    records = (Map<String, JSONObject>)field("records"); processes = (Map<String, Object>)field("processes"); cancellations = (Map<String, Object>)field("cancellations");
    check(Boolean.FALSE.equals(field("loaded")) && records.isEmpty() && processes.isEmpty() && cancellations.isEmpty() && Boolean.FALSE.equals(field("searching")), "Fresh idle download runtime required");
    JSONArray initial = persisted(); check(initial.length() <= 200, "Unexpected original history size");
    Set<String> ids = new HashSet<>();
    for (int i = 0; i < initial.length(); i++) {
      JSONObject job = initial.getJSONObject(i); String id = job.getString("id"), stage = job.getString("stage");
      check(UUID.fromString(id).toString().equals(id) && ids.add(id), "Invalid original job identity; preserve it");
      // A ready original could be awaiting recovery/import. Never share this fixture with it.
      check(TERMINAL.contains(stage) && !stage.equals("ready"), "Original active/ready jobs require deliberate recovery; preserve them");
    }
    beforeDigest = digest(initial); originalJobsFileExisted = jobsFile.exists();
    invoke("jobs", context);
    for (Map.Entry<String, JSONObject> entry : records.entrySet()) originals.put(entry.getKey(), entry.getValue());
    check(originals.size() == initial.length(), "Original history changed during load");
    originalsUnchanged(); check(digest(persisted()).equals(beforeDigest), "Loaded original metadata differs"); claimed = true;
  }
  private static void writeNew(File file, byte[] bytes) throws Exception {
    check(file.createNewFile(), "Preserve an existing fixture file");
    try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
  }
  private Fixture fixture(String stage, boolean metadata) throws Exception {
    originalsUnchanged(); Fixture fixture = new Fixture(); fixture.id = UUID.randomUUID().toString();
    fixture.directory = new File(root, fixture.id).getCanonicalFile(); check(fixture.directory.getParentFile().equals(root) && !fixture.directory.exists(), "Fixture identity already exists; preserve it");
    check(!records.containsKey(fixture.id) && !cancellations.containsKey(fixture.id) && fixture.directory.mkdir(), "Could not claim fresh fixture directory");
    fixtures.put(fixture.id, fixture);
    fixture.marker = new File(fixture.directory, ".download-completion-probe-owner"); fixture.audio = new File(fixture.directory, "audio.mp3");
    writeNew(fixture.marker, (token + ":" + fixture.id).getBytes("UTF-8")); fixture.markerHash = hash(fixture.marker, 256);
    byte[] audio = new byte[256]; audio[0] = 'I'; audio[1] = 'D'; audio[2] = '3';
    writeNew(fixture.audio, audio); fixture.audioHash = hash(fixture.audio, 256);
    fixture.job = new JSONObject().put("id", fixture.id).put("url", "https://example.invalid/metadata-only.mp3").put("title", "Metadata-only completion fixture")
      .put("showId", "qa-download-probe-" + token).put("setId", "qa-set").put("category", "atmosphere").put("stage", stage).put("percent", stage.equals("ready") ? 100 : JSONObject.NULL);
    if (metadata) fixture.job.put("uri", Uri.fromFile(fixture.audio).toString()).put("bytes", 256);
    records.put(fixture.id, fixture.job); fixture.recordAdded = true; invoke("save", context); return fixture;
  }
  private void owned(Fixture fixture) throws Exception {
    originalsUnchanged(); check(fixture.recordAdded && records.get(fixture.id) == fixture.job && !fixture.removed, "Owned record changed; preserve it");
    check(!processes.containsKey(fixture.id) && cancellations.get(fixture.id) == fixture.cancellation, "Owned work changed; preserve it");
    directoryOwned(fixture);
  }
  private void directoryOwned(Fixture fixture) throws Exception {
    check(fixture.directory.getCanonicalFile().equals(new File(root, fixture.id).getCanonicalFile()) && fixture.directory.getParentFile().equals(root), "Fixture directory escaped root");
    if (!fixture.directory.exists()) return;
    check(fixture.directory.isDirectory() && fixture.marker.isFile() && hash(fixture.marker, 256).equals(fixture.markerHash), "Fixture ownership marker changed; preserve it");
    File[] files = fixture.directory.listFiles(); check(files != null && files.length <= 2, "Unexpected fixture contents; preserve them");
    for (File file : files) {
      check(file.isFile() && file.getCanonicalFile().getParentFile().equals(fixture.directory), "Unexpected fixture child; preserve it");
      check(file.getName().equals(fixture.marker.getName()) || file.getName().equals("audio.mp3") && hash(file, 256).equals(fixture.audioHash), "Fixture bytes changed; preserve them");
    }
  }
  private void cancel(Fixture fixture) throws Exception {
    owned(fixture); invoke("cancel", context, fixture.id);
    Object created = cancellations.get(fixture.id); check(fixture.cancellation == null || fixture.cancellation == created, "Cancellation identity changed"); fixture.cancellation = created;
  }
  private void complete(Fixture fixture) throws Exception { owned(fixture); invoke("complete", context, fixture.id); }
  private void refused(Fixture fixture) throws Exception {
    String before = canonical(fixture.job, 0); boolean refused = false;
    try { complete(fixture); } catch (IllegalArgumentException failure) { check("DOWNLOAD_INVALID".equals(failure.getMessage()), "Unexpected native refusal"); refused = true; }
    check(refused && before.equals(canonical(fixture.job, 0)), "Invalid completion mutated/admitted the record");
  }
  private void record(String name, Fixture fixture) throws Exception {
    passed.add(name);
    observations.put(new JSONObject().put("case", name).put("id", fixture.id).put("stage", fixture.job.optString("stage"))
      .put("markerPresent", fixture.job.has("cancelledAfterReady")).put("markerType", fixture.job.has("cancelledAfterReady") ? fixture.job.get("cancelledAfterReady").getClass().getSimpleName() : "absent")
      .put("directoryExists", fixture.directory.exists()).put("audioExists", fixture.audio.exists()));
  }
  @SuppressWarnings("unchecked") private void remove(Fixture fixture) throws Exception {
    owned(fixture); check(TERMINAL.contains(fixture.job.optString("stage")), "Fixture still active; preserve it");
    invoke("remove", context, fixture.id);
    check(!records.containsKey(fixture.id) && !fixture.directory.exists(), "Native removal did not remove owned record/files");
    if (fixture.cancellation != null) {
      check(cancellations instanceof ConcurrentMap && cancellations.get(fixture.id) == fixture.cancellation && !processes.containsKey(fixture.id), "Owned cancellation changed; preserve it");
      check(((ConcurrentMap<String, Object>)cancellations).remove(fixture.id, fixture.cancellation), "Owned cancellation removal failed");
    }
    fixture.removed = true; originalsUnchanged();
  }
  private void verify() throws Exception {
    Fixture ready = fixture("ready", true); complete(ready);
    check(ready.job.optString("stage").equals("attached") && !ready.directory.exists() && !ready.job.has("cancelledAfterReady"), "Ready completion did not attach and remove staging"); record("Ready completion attaches", ready);
    String attached = canonical(ready.job, 0); complete(ready); check(attached.equals(canonical(ready.job, 0)), "Repeated complete changed attached metadata"); record("Attached completion is idempotent", ready);
    cancel(ready); check(attached.equals(canonical(ready.job, 0)) && ready.cancellation == null, "Cancel changed an attached record"); record("Cancel after attached is a no-op", ready); remove(ready);

    Fixture late = fixture("ready", true); cancel(late);
    check(late.job.optString("stage").equals("cancelled") && Boolean.TRUE.equals(late.job.opt("cancelledAfterReady")) && late.job.isNull("percent"), "Ready cancellation lost runtime completion provenance"); record("Ready cancel retains completion provenance", late);
    cancel(late); check(Boolean.TRUE.equals(late.job.opt("cancelledAfterReady")), "Repeated cancel removed completion provenance"); record("Repeated cancellation preserves provenance", late);
    owned(late); check(hash(late.audio, 256).equals(late.audioHash) && late.audio.delete(), "Could not remove owned staging fixture");
    complete(late); check(late.job.optString("stage").equals("attached") && !late.job.has("cancelledAfterReady") && !late.directory.exists(), "Late-cancel completion did not preserve committed claim"); record("Committed claim completes after cancelled-ready staging is absent", late); remove(late);

    Fixture incomplete = fixture("queued", false); cancel(incomplete);
    check(incomplete.job.optString("stage").equals("cancelled") && !incomplete.job.has("cancelledAfterReady"), "Incomplete cancellation gained provenance"); refused(incomplete); cancel(incomplete); refused(incomplete); record("Incomplete cancel refuses repeated completion", incomplete); remove(incomplete);
    Fixture legacy = fixture("cancelled", true); refused(legacy); record("Legacy cancellation without provenance is refused", legacy); remove(legacy);
    Fixture stringMarker = fixture("cancelled", true); stringMarker.job.put("cancelledAfterReady", "true"); invoke("save", context); refused(stringMarker); record("String completion marker is refused", stringMarker); remove(stringMarker);
    Fixture numericMarker = fixture("cancelled", true); numericMarker.job.put("cancelledAfterReady", 1); invoke("save", context); refused(numericMarker); record("Numeric completion marker is refused", numericMarker); remove(numericMarker);
    Fixture wrongUri = fixture("cancelled", true); wrongUri.job.put("cancelledAfterReady", true).put("uri", Uri.fromFile(new File(wrongUri.directory, "other.mp3")).toString()); invoke("save", context); refused(wrongUri); record("Completion provenance with wrong URI is refused", wrongUri); remove(wrongUri);
    Fixture wrongBytes = fixture("cancelled", true); wrongBytes.job.put("cancelledAfterReady", true);
    for (Object value : new Object[]{256.5, "256", JSONObject.NULL, 127, 500000001L}) { wrongBytes.job.put("bytes", value); invoke("save", context); refused(wrongBytes); }
    record("Malformed or out-of-range completed byte counts are refused", wrongBytes); remove(wrongBytes);

    JSONObject incoming = new JSONObject().put("id", UUID.randomUUID().toString()).put("title", "Untrusted input fixture").put("uri", "file:///not-a-runtime-output.mp3").put("bytes", 256).put("cancelledAfterReady", true).put("errorCode", "old").put("receiving", true);
    String identity = incoming.getString("id"); invoke("clearIncomingCompletion", incoming);
    for (String key : new String[]{"uri", "bytes", "cancelledAfterReady", "errorCode", "receiving"}) check(!incoming.has(key), "Start-input completion field was retained");
    check(incoming.getString("id").equals(identity) && incoming.getString("title").equals("Untrusted input fixture"), "Input sanitization changed ordinary fields");
    passed.add("Runtime start-input sanitizer removes completion evidence"); observations.put(new JSONObject().put("case", passed.get(passed.size()-1)).put("registeredJob", false));
    check(passed.size() == 13, "Missing native metadata scenarios");
  }
  @SuppressWarnings("deprecation") private List<ActivityManager.RunningServiceInfo> services() {
    ActivityManager manager = (ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
    check(manager != null, "Service observation unavailable");
    List<ActivityManager.RunningServiceInfo> values = manager.getRunningServices(100);
    check(values != null && values.size() < 100, "Service observation unavailable or truncated"); return values;
  }
  private void observeIdleCancellation() throws Exception {
    Object current = cancellations.get(idleId);
    check(idleCancellation == null || current == idleCancellation, "Idle cancellation identity changed; preserve it");
    if (current != null) idleCancellation = current;
    check(!records.containsKey(idleId) && !new File(root, idleId).exists(), "Unknown cancel created unexpected work; preserve it");
  }
  private void verifyIdleCancel() throws Exception {
    synchronized (runtime) { originalsUnchanged(); check(cancellations.isEmpty() && records.size() == originals.size(), "Idle cancel requires no other work"); }
    check(services().isEmpty(), "Target services are not idle; preserve them");
    idleId = UUID.randomUUID().toString(); check(!new File(root, idleId).exists(), "Preserve existing idle fixture identity");
    synchronized (runtime) { originalsUnchanged(); check(!records.containsKey(idleId) && !cancellations.containsKey(idleId), "Preserve an existing idle job identity"); }
    idleIntent = new Intent().setComponent(new ComponentName(context.getPackageName(), "app.showcontrol.downloads.ShowDownloadService")).setAction("cancel").putExtra("id", idleId);
    final ComponentName[] started = new ComponentName[1]; final Throwable[] startFailure = new Throwable[1]; idleStartMs = SystemClock.elapsedRealtime();
    runOnMainSync(() -> { try { started[0] = context.startService(idleIntent); } catch (Throwable failure) { startFailure[0] = failure; } });
    if (startFailure[0] != null) throw new IllegalStateException("Idle service start was not admitted", startFailure[0]);
    check(idleIntent.getComponent().equals(started[0]), "Idle service start component differs"); idleServiceStarted = true;
    waitForIdleSync();
    long end = SystemClock.elapsedRealtime() + 2000, silentSince = -1;
    while (SystemClock.elapsedRealtime() < end) {
      budget(); List<ActivityManager.RunningServiceInfo> active = services();
      synchronized (runtime) { originalsUnchanged(); observeIdleCancellation(); }
      if (active.isEmpty()) {
        if (silentSince < 0) silentSince = SystemClock.elapsedRealtime();
        if (SystemClock.elapsedRealtime() - silentSince >= 300) { idleServiceRemoved = true; passed.add("Idle stale-cancel service stops itself"); serviceObservations.put(new JSONObject().put("case", "idle-cancel").put("acceptedComponent", started[0].flattenToString()).put("remainingServices", 0).put("idleCancellationObserved", idleCancellation != null)); return; }
      } else { silentSince = -1; requireOwnIdleService(active); }
      SystemClock.sleep(25);
    }
    idleCancelLeaked = true; throw new IllegalStateException("Idle stale-cancel service remained started after its cancellation request");
  }
  private void requireOwnIdleService(List<ActivityManager.RunningServiceInfo> active) throws Exception {
    check(idleServiceStarted && active.size() == 1, "Unexpected target service; preserve it");
    ActivityManager.RunningServiceInfo service = active.get(0);
    check(idleIntent.getComponent().equals(service.service) && service.pid == android.os.Process.myPid() && service.uid == android.os.Process.myUid() && service.activeSince >= idleStartMs - 100 && service.started && !service.foreground,
      "Idle service ownership changed; preserve it");
    serviceObservations.put(new JSONObject().put("component", service.service.flattenToString()).put("pid", service.pid).put("uid", service.uid).put("activeSince", service.activeSince).put("observedAt", SystemClock.elapsedRealtime()));
  }
  @SuppressWarnings("unchecked") private void cleanupIdleService() throws Exception {
    if (!idleServiceStarted) return;
    synchronized (runtime) {
      originalsUnchanged(); observeIdleCancellation(); check(records.size() == originals.size() && processes.isEmpty(), "New work owns the service; preserve it");
      List<ActivityManager.RunningServiceInfo> active = services();
      if (!active.isEmpty()) { requireOwnIdleService(active); idleStopRequested = true; context.stopService(idleIntent); }
    }
    long end = SystemClock.elapsedRealtime() + 3000;
    while (SystemClock.elapsedRealtime() < end) { List<ActivityManager.RunningServiceInfo> active = services(); if (active.isEmpty()) break; budget(); requireOwnIdleService(active); SystemClock.sleep(25); }
    check(services().isEmpty(), "Owned idle service did not stop; preserve it"); idleServiceRemoved = true;
    synchronized (runtime) {
      originalsUnchanged(); observeIdleCancellation();
      if (idleCancellation != null) { check(cancellations instanceof ConcurrentMap && cancellations.get(idleId) == idleCancellation, "Owned idle cancellation changed; preserve it"); check(((ConcurrentMap<String, Object>)cancellations).remove(idleId, idleCancellation), "Owned idle cancellation cleanup failed"); }
      check(!cancellations.containsKey(idleId) && !records.containsKey(idleId), "Idle cancellation residue remains");
    }
  }
  private static String details(Throwable failure) {
    try { JSONArray chain = new JSONArray(); Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>()); Throwable value = failure;
      while (value != null && chain.length() < 8 && seen.add(value)) { chain.put(value.toString()); value = value.getCause(); }
      StringWriter stack = new StringWriter(); failure.printStackTrace(new PrintWriter(stack)); String text = stack.toString();
      return new JSONObject().put("causes", chain).put("stack", text.substring(0, Math.min(text.length(), 16000))).toString();
    } catch (Exception ignored) { return failure.toString(); }
  }
  @Override public void onStart() {
    Bundle result = new Bundle(); int code = 1;
    try {
      deadline = SystemClock.elapsedRealtime() + 40000; token = arguments.getString("token", ""); check(UUID.fromString(token).toString().equals(token), "Fresh UUID token required");
      scenario = arguments.getString("scenario", "all"); check(scenario.equals("all") || scenario.equals("idle-cancel"), "Unsupported scenario");
      context = getTargetContext().getApplicationContext(); check(context.getPackageName().equals("app.showcontrol.working") && arguments.getString("expectedPackage", "").equals(context.getPackageName()), "Wrong target package");
      String expected = arguments.getString("expectedApkSha256", ""); check(expected.matches("[A-F0-9]{64}") && hash(new File(context.getApplicationInfo().sourceDir), 200_000_000).equals(expected), "Installed target APK differs");
      File files = context.getFilesDir().getCanonicalFile(); File requestedRoot = new File(files, "showcontrol-downloads").getAbsoluteFile(); root = requestedRoot.getCanonicalFile(); check(root.equals(requestedRoot) && root.getParentFile().equals(files), "Download metadata root escaped app files"); jobsFile = new File(root, "jobs.json");
      runtime = context.getClassLoader().loadClass("app.showcontrol.downloads.DownloadRuntime").getField("INSTANCE").get(null);
      synchronized (runtime) { claim(); if (scenario.equals("all")) verify(); originalsUnchanged(); afterDigest = digest(persisted()); check(afterDigest.equals(beforeDigest), "Persisted original jobs changed"); }
      verifyIdleCancel(); check(passed.size() == (scenario.equals("all") ? 14 : 1), "Missing scenarios");
      result.putString("targetSha256", expected); code = -1;
    } catch (Throwable failure) { result.putString("failure", failure.toString()); result.putString("failureDetails", details(failure)); }
    finally {
      try { cleanupIdleService(); } catch (Throwable failure) { result.putString("cleanupFailure", failure.toString()); result.putString("cleanupFailureDetails", details(failure)); code = 1; }
      if (claimed && runtime != null) synchronized (runtime) {
        try { for (Fixture fixture : fixtures.values()) if (!fixture.removed) { if (fixture.recordAdded) { if (!TERMINAL.contains(fixture.job.optString("stage"))) cancel(fixture); remove(fixture); } else throw new IllegalStateException("Partial fixture ownership; preserve it"); } originalsUnchanged(); afterDigest = digest(persisted()); check(afterDigest.equals(beforeDigest), "Original persisted jobs changed"); result.putBoolean("originalJobsUnchanged", true); }
        catch (Throwable failure) { result.putString("cleanupFailure", failure.toString()); result.putString("cleanupFailureDetails", details(failure)); code = 1; }
        boolean filesRemoved = true, recordsRemoved = true;
        for (Fixture fixture : fixtures.values()) { filesRemoved &= !fixture.directory.exists(); recordsRemoved &= !records.containsKey(fixture.id) && !cancellations.containsKey(fixture.id); }
        if (idleId != null) { filesRemoved &= !new File(root, idleId).exists(); recordsRemoved &= !records.containsKey(idleId) && !cancellations.containsKey(idleId); }
        result.putBoolean("ownedFilesRemoved", filesRemoved); result.putBoolean("ownedRecordsRemoved", recordsRemoved);
        try { idle(); check(cancellations.isEmpty() && records.size() == originals.size(), "Owned runtime residue remains"); result.putBoolean("nativeRuntimeIdle", true); } catch (Throwable failure) { result.putString("cleanupFailure", failure.toString()); code = 1; }
        if (!filesRemoved || !recordsRemoved) code = 1;
      }
      result.putInt("casesPassed", passed.size()); result.putString("cases", new JSONArray(passed).toString()); result.putString("observations", observations.toString());
      result.putString("ownedFixtureIds", new JSONArray(fixtures.keySet()).toString());
      result.putString("scenario", scenario); result.putString("idleCancellationId", idleId); result.putBoolean("idleCancelLeaked", idleCancelLeaked); result.putBoolean("idleServiceStarted", idleServiceStarted); result.putBoolean("idleServiceStopRequested", idleStopRequested); result.putBoolean("idleServiceRemoved", idleServiceRemoved); result.putString("serviceObservations", serviceObservations.toString());
      result.putString("originalJobsBeforeSha256", beforeDigest); result.putString("originalJobsAfterSha256", afterDigest); result.putInt("originalJobsCount", originals.size()); result.putBoolean("originalJobsFileExisted", originalJobsFileExisted);
      result.putString("originalsScope", "Logical jobs.json records and order only; no original media, library, secure storage or API keys read"); result.putBoolean("passed", code == -1); finish(code, result);
    }
  }
}
