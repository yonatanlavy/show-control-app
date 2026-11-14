package app.showcontrol.rehearsalseekprobe;

import android.app.Instrumentation;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.SystemClock;
import java.io.*;
import java.lang.reflect.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;

/** Separate same-test-signer instrumentation. No product endpoint or library writes. */
public final class RehearsalSeekProbe extends Instrumentation {
  private Bundle arguments;
  private Context context;
  private ClassLoader loader;
  private Object runtime, unit, emitter, ownedService, ownedPrepared;
  private String token, fixtureHash, originalLibrary, showId, showPrefix;
  private File fixture;
  private byte[] audio;
  private boolean ownsSession, ownsFixture, receiverRegistered, cleaning;
  private long deadline, ownedGeneration = -1;
  private int preparationIndex;
  private String lastSafeObservation;
  private final List<JSONObject> events = new CopyOnWriteArrayList<>();
  private final List<JSONObject> commandEvents = new CopyOnWriteArrayList<>();
  private final AtomicInteger totalEvents = new AtomicInteger();
  private final List<String> passed = new ArrayList<>();
  private final JSONArray observations = new JSONArray();
  private final BroadcastReceiver receiver = new BroadcastReceiver() {
    @Override public void onReceive(Context ignored, Intent intent) {
      try {
        String encoded = intent.getStringExtra("event");
        if (encoded == null || encoded.length() > 32768) return;
        JSONObject event = new JSONObject(encoded);
        if (event.optString("showId").startsWith(showPrefix)) {
          totalEvents.incrementAndGet();
          if (showId.equals(event.optString("showId")) && events.size() < 10000) events.add(event);
          if ((event.optString("type").equals("ACK") || event.optString("type").equals("FAULT")) && commandEvents.size() < 128) commandEvents.add(event);
        }
      } catch (JSONException ignoredError) { }
    }
  };

  @Override public void onCreate(Bundle args) { arguments = args; start(); }
  private static void check(boolean condition, String message) { if (!condition) throw new IllegalStateException(message); }
  private static String failureDetails(Throwable failure) {
    try {
      JSONArray chain=new JSONArray();Set<Throwable> seen=Collections.newSetFromMap(new IdentityHashMap<Throwable,Boolean>());
      for(Throwable current=failure;current!=null && seen.add(current) && chain.length()<8;current=current.getCause())chain.put(new JSONObject().put("type",current.getClass().getName()).put("message",String.valueOf(current.getMessage())));
      StringWriter buffer=new StringWriter();failure.printStackTrace(new PrintWriter(buffer));String stack=buffer.toString();
      return new JSONObject().put("causes",chain).put("stack",stack.substring(0,Math.min(stack.length(),16000))).toString();
    } catch(Exception ignored){return String.valueOf(failure);}
  }
  private static String hex(byte[] bytes) {
    StringBuilder result = new StringBuilder();
    for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02X", value));
    return result.toString();
  }
  private static String hash(File file) throws Exception {
    check(file.isFile() && file.length() <= 200_000_000, "Unexpected checksum input");
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] bytes = new byte[65536]; int count;
      while ((count = input.read(bytes)) != -1) hash.update(bytes, 0, count);
    }
    return hex(hash.digest());
  }
  private String libraryDigest() throws Exception {
    File library = new File(context.getFilesDir(), "show-control-library/library.db").getCanonicalFile();
    check(library.isFile() && library.getPath().startsWith(context.getFilesDir().getCanonicalPath() + File.separator), "Initialized synthetic library required");
    MessageDigest digest = MessageDigest.getInstance("SHA-256"); long bytes = 0; int cells = 0;
    try (SQLiteDatabase db = SQLiteDatabase.openDatabase(library.getPath(), null, SQLiteDatabase.OPEN_READONLY)) {
      // API-35-owned fixture only: one read-only snapshot includes committed WAL
      // pages without comparing journal bytes or causing a write/checkpoint.
      check(Build.VERSION.SDK_INT >= 35, "API 35 read-only snapshot required"); db.beginTransactionReadOnly();
      try {
        for (String table : new String[]{"shows", "media_assets", "controller_profiles", "show_revisions", "deleted_shows", "library_settings", "migration_ledger", "assistant_prompts"}) {
          String key = table.equals("library_settings") ? "key" : table.equals("migration_ledger") ? "version" : "id";
          digest.update(table.getBytes("UTF-8"));
          try (Cursor cursor = db.rawQuery("SELECT * FROM " + table + " ORDER BY " + key, null)) {
            while (cursor.moveToNext()) for (int column = 0; column < cursor.getColumnCount(); column++) {
              byte[] value = (cursor.isNull(column) ? "<null>" : cursor.getString(column)).getBytes("UTF-8");
              bytes += value.length; check(bytes <= 32_000_000 && ++cells <= 100000, "Unexpected library size; preserve it");
              digest.update((value.length + ":").getBytes("UTF-8")); digest.update(value);
            }
          }
        }
      } finally { db.endTransaction(); }
    }
    return hex(digest.digest());
  }
  private Object field(Object target, String name) throws Exception {
    Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(target);
  }
  private Object owner() throws Exception { return field(runtime, "service"); }
  private void absent() throws Exception {
    check(owner() == null && field(runtime, "startingService") == null && field(runtime, "pendingPrepare") == null && field(runtime, "pendingPreview") == null,
      "Native owner or preparation remains; preserve it");
  }
  private Object invoke(Object target, String name, Object... args) throws Exception {
    List<Method> methods = new ArrayList<>();
    for (Method method : target.getClass().getMethods()) if ((method.getName().equals(name) || method.getName().startsWith(name + "$")) && method.getParameterTypes().length == args.length) methods.add(method);
    check(methods.size() == 1, "Native method boundary changed: " + name);
    try { methods.get(0).setAccessible(true); return methods.get(0).invoke(target, args); }
    catch (InvocationTargetException error) { throw new IllegalStateException("Native invocation failed: " + name, error.getCause()); }
  }
  private interface Callback { void invoke(Object[] args); }
  private Object function(int arity, Callback callback) throws Exception {
    Class<?> type = loader.loadClass("kotlin.jvm.functions.Function" + arity);
    return Proxy.newProxyInstance(loader, new Class<?>[]{type}, (proxy, method, args) -> {
      if (method.getName().equals("invoke")) { callback.invoke(args == null ? new Object[0] : args); return unit; }
      if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
      if (method.getName().equals("equals")) return proxy == args[0];
      return "Synthetic rehearsal callback";
    });
  }
  private long budget(long maximum) {
    return cleaning ? maximum : Math.max(1, Math.min(maximum, deadline - SystemClock.elapsedRealtime()));
  }
  private final class Call {
    final CountDownLatch done = new CountDownLatch(1);
    final AtomicInteger count = new AtomicInteger();
    final Object resolve, reject;
    volatile String error;
    volatile Throwable guardError;
    Call() throws Exception {
      resolve = function(0, args -> { count.incrementAndGet(); done.countDown(); });
      reject = function(2, args -> { error = String.valueOf(args[0]); count.incrementAndGet(); done.countDown(); });
    }
    void await() throws Exception { check(done.await(budget(8000), TimeUnit.MILLISECONDS), "Native callback remains pending"); check(count.get() == 1, "Native callback completed more than once"); }
    void success() throws Exception { await(); if(error!=null)throw new IllegalStateException("Native operation refused: "+error,guardError); }
    void refused(String expected) throws Exception { await(); check(expected.equals(error), "Expected " + expected + ", observed " + error); }
    void guardFailure(Throwable failure) { guardError=failure;error="PROBE_OWNER_CHANGED_OR_BOUNDARY_FAILED: "+failure;count.incrementAndGet();done.countDown(); }
  }
  private interface Condition { boolean ready() throws Exception; }
  private void until(Condition condition, String label) throws Exception {
    long end = SystemClock.elapsedRealtime() + budget(5000);
    while (SystemClock.elapsedRealtime() < end) { if (condition.ready()) return; SystemClock.sleep(20); }
    throw new IllegalStateException("Timed out: " + label);
  }
  private Call dispatch(long id, String type, JSONObject fields) throws Exception {
    JSONObject command = fields == null ? new JSONObject() : new JSONObject(fields.toString());
    command.put("id", id).put("type", type);
    return guardedOwnerCall("executeCommand",command);
  }
  private Call guardedOwnerCall(String methodName, JSONObject command) throws Exception {
    final Object service=ownedService, prepared=ownedPrepared;final long generation=ownedGeneration;final String expectedShow=showId;
    check(service!=null && prepared!=null,"No accepted owned preparation"); final Call call=new Call();
    check(((Handler)field(service,"commands")).post(()->{
      try {
        // Admission and production execution share this one queue turn. A queued
        // same-service reprepare cannot slip between ownership check and action.
        check(owner()==service && field(service,"prepared")==prepared && expectedShow.equals(field(prepared,"showId")) && ((Number)field(service,"triggerGeneration")).longValue()==generation,"Preparation changed; preserve new ownership");
        List<Method> matches=new ArrayList<>();int arity=command==null?2:3;
        for(Method method:service.getClass().getDeclaredMethods())if(method.getName().equals(methodName)&&method.getParameterTypes().length==arity)matches.add(method);
        check(matches.size()==1,"Production owner boundary changed: "+methodName);Method method=matches.get(0);method.setAccessible(true);
        if(command==null)method.invoke(service,call.resolve,call.reject);else method.invoke(service,command,call.resolve,call.reject);
      } catch(Throwable error){call.guardFailure(error);}
    }),"Owned queue closed; preserve any new owner");
    return call;
  }
  private JSONObject ack(long id) {
    for (JSONObject event : events) if (event.optString("showId").equals(showId) && event.optLong("generation", -1) == ownedGeneration && event.optString("type").equals("ACK") && event.optLong("commandId", -1) == id) return event;
    return null;
  }
  private void accepted(long id, String type, JSONObject fields) throws Exception {
    dispatch(id, type, fields).success();
    OwnerRead admitted=inspect(ownedService,false,type.equals("PREVIOUS")); check(admitted.lastCommandId==id,"Accepted command watermark changed"); ownedGeneration=admitted.generation;
    until(() -> ack(id) != null, "native ACK " + id);
    check(ack(id).has("monotonicMs"), "ACK lacks native monotonic timestamp");
  }
  private void shutdown() throws Exception {
    if(owner()!=null){
      final Object closing=ownedService;guardedOwnerCall("shutdownOnCommands",null).success();
      until(()->{Object active=owner(),starting=field(runtime,"startingService");check((active==null||active==closing)&&(starting==null||starting==closing),"Different owner appeared during detach; preserve it");return active==null&&starting==null&&field(runtime,"pendingPrepare")==null&&field(runtime,"pendingPreview")==null;},"accepted owned shutdown detaches");
    }
    absent();
    ownedService=null;ownedPrepared=null;ownedGeneration=-1;ownsSession=false;
  }
  private void prepare(JSONObject snapshot) throws Exception {
    absent(); check(ownedService==null,"Prior owned preparation not released");
    showId=showPrefix+(++preparationIndex); snapshot.put("showId",showId); events.clear();
    Call call = new Call(); invoke(runtime, "prepare", context, snapshot.toString(), emitter, call.resolve, call.reject); call.success();
    Object admitted=owner(); OwnerRead claimed=inspect(admitted,true,false);
    ownedService=admitted;ownedPrepared=claimed.prepared;ownedGeneration=claimed.generation;ownsSession=true;
    record("accepted preparation ownership",claimed);
  }

  private static final class VoiceRead {
    String id, cueId; long position; boolean primary, mainOwned, playWhenReady, playing; double rate, savedRate;
    JSONObject json() throws Exception { return new JSONObject().put("voiceId", id).put("cueId", cueId).put("positionMs", position).put("primary", primary).put("mainOwned", mainOwned).put("playWhenReady", playWhenReady).put("playing", playing).put("rate", rate).put("savedRate", savedRate); }
  }
  private static final class OwnerRead {
    long monotonicMs, lastCommandId, generation; Object prepared; String serviceIdentity, preparedIdentity; boolean paused; JSONObject state; final List<VoiceRead> voices = new ArrayList<>();
    VoiceRead primary() { for (VoiceRead voice : voices) if (voice.primary) return voice; throw new IllegalStateException("Primary voice absent"); }
    VoiceRead other() { for (VoiceRead voice : voices) if (!voice.primary) return voice; throw new IllegalStateException("Independent/carried voice absent"); }
    VoiceRead byId(String id) { for (VoiceRead voice : voices) if (voice.id.equals(id)) return voice; throw new IllegalStateException("Voice identity changed"); }
    JSONObject json() throws Exception { JSONArray array = new JSONArray(); for (VoiceRead voice : voices) array.put(voice.json()); return new JSONObject().put("monotonicMs", monotonicMs).put("generation",generation).put("serviceIdentity",serviceIdentity).put("preparedIdentity",preparedIdentity).put("lastCommandId", lastCommandId).put("paused", paused).put("state", state).put("voices", array); }
  }
  private OwnerRead read() throws Exception {
    return inspect(ownedService,false,false);
  }
  private OwnerRead inspect(final Object service, boolean claiming, boolean allowedGenerationChange) throws Exception {
    check(service != null, "No accepted owned service");
    AtomicReference<OwnerRead> result = new AtomicReference<>(); AtomicReference<Throwable> failure = new AtomicReference<>(); AtomicReference<String> stage=new AtomicReference<>("owner identity");CountDownLatch done = new CountDownLatch(1);
    check(((Handler)field(service, "commands")).post(() -> {
      try {
        check(owner() == service, "Native owner changed; preserve the new owner");
        stage.set("prepared identity");
        Object prepared=field(service,"prepared"); check(prepared!=null && showId.equals(field(prepared,"showId")),"Preparation identity changed; preserve it");
        long generation=((Number)field(service,"triggerGeneration")).longValue();
        if(!claiming) check(service==ownedService && prepared==ownedPrepared && (allowedGenerationChange || generation==ownedGeneration),"Owned preparation/generation changed; preserve it");
        OwnerRead sample = new OwnerRead(); sample.prepared=prepared;sample.generation=generation;sample.serviceIdentity=Integer.toHexString(System.identityHashCode(service));sample.preparedIdentity=Integer.toHexString(System.identityHashCode(prepared));sample.paused = Boolean.TRUE.equals(field(service, "enginePaused")); sample.lastCommandId = ((Number)field(service, "lastCommandId")).longValue();
        stage.set("run state");Method state = service.getClass().getDeclaredMethod("runState"); state.setAccessible(true); sample.state = new JSONObject((Map<?, ?>)state.invoke(service));
        String primaryId = (String)field(service, "mainVoiceId");
        for (Object voice : ((Map<?, ?>)field(service, "voices")).values()) {
          stage.set("voice position/rate");Object cue = field(voice, "cue"), player = field(voice, "player"); VoiceRead value = new VoiceRead();
          value.id = (String)field(voice, "id"); value.cueId = (String)field(cue, "id");
          value.primary = value.id.equals(primaryId) && Boolean.TRUE.equals(field(voice, "mayAutoFollowMainStack"));
          value.mainOwned = Boolean.TRUE.equals(field(voice, "belongsToMainSequence")); value.position = ((Number)invoke(player, "getCurrentPosition")).longValue();
          value.playWhenReady = Boolean.TRUE.equals(invoke(player, "getPlayWhenReady")); value.playing = Boolean.TRUE.equals(invoke(player, "isPlaying")); value.savedRate = ((Number)field(cue, "playbackRate")).doubleValue();
          Object parameters = invoke(player, "getPlaybackParameters"); value.rate = ((Number)parameters.getClass().getField("speed").get(parameters)).doubleValue(); sample.voices.add(value);
        }
        sample.monotonicMs = SystemClock.elapsedRealtime();lastSafeObservation=sample.json().toString();result.set(sample);
      } catch (Throwable error) { failure.set(error); } finally { done.countDown(); }
    }), "Native owner queue closed");
    check(done.await(budget(3000), TimeUnit.MILLISECONDS), "Owner observation remains pending");
    if (failure.get() != null) throw new IllegalStateException("Owner observation failed at "+stage.get()+": "+failure.get(), failure.get());
    check(result.get() != null, "Owner observation missing"); return result.get();
  }
  private void record(String label, OwnerRead sample) throws Exception { observations.put(new JSONObject().put("label", label).put("sample", sample.json())); }
  private void paused(OwnerRead sample, int count, double rate) {
    check(sample.paused && sample.voices.size() == count, "Pause or voice count changed");
    for (VoiceRead voice : sample.voices) check(!voice.playWhenReady && Math.abs(voice.rate-rate) < .001 && Math.abs(voice.savedRate-rate) < .001, "Seek changed pause/rate");
  }
  private void unchanged(OwnerRead before, OwnerRead after, String id) {
    check(Math.abs(before.byId(id).position - after.byId(id).position) <= 2, "Unselected paused voice moved");
  }
  private void starts(int count) throws Exception {
    until(() -> { OwnerRead state = read(); if (state.voices.size() != count) return false; for (VoiceRead voice : state.voices) if (voice.position <= 0) return false; return true; }, "actual source progress for " + count + " voices");
  }
  private JSONObject cue(String id, double rate) throws Exception {
    JSONObject media = new JSONObject().put("id", "qa-seek-media-" + token).put("localUri", fixture.toURI().toString().replace("file:/", "file:///"))
      .put("checksumSha256", fixtureHash.toLowerCase(Locale.ROOT)).put("bytes", audio.length).put("durationMs", 30000).put("codec", "wav").put("channels", 1).put("sampleRate", 48000);
    return new JSONObject().put("id", id).put("name", "Synthetic rehearsal seek").put("type", "audio").put("tags", new JSONArray().put("qa-rehearsal-seek"))
      .put("mediaAssetId", media.getString("id")).put("mediaAsset", media).put("trimInMs", 5000).put("trimOutMs", 25000)
      .put("gainDb", -96).put("fadeInMs", 0).put("fadeOutMs", 0).put("fadeCurve", "smooth").put("preWaitMs", 0)
      .put("endBehavior", "loop").put("playbackRate", rate).put("autoPlay", false).put("crossfadeEnabled", false).put("crossfadeMs", 2000);
  }
  private JSONObject snapshot(double rate, boolean grouped) throws Exception {
    JSONObject cues = new JSONObject().put("shared", cue("shared", rate)).put("other", cue("other", rate));
    JSONArray order = new JSONArray();
    if (grouped) {
      cues.put("group", new JSONObject().put("id", "group").put("type", "group").put("name", "Synthetic carryover group").put("tags", new JSONArray())
        .put("children", new JSONArray().put(new JSONObject().put("cueId", "shared").put("offsetMs", 0)))); order.put("group");
    }
    return new JSONObject().put("schemaVersion", 2).put("transportMode", grouped ? "legacyCueStack" : "oms").put("sessionPurpose", "rehearsal").put("voiceLimit", 8)
      .put("showId", showId).put("showName","Synthetic rehearsal seek QA").put("setId", "qa-set").put("setName","Ephemeral native rehearsal").put("revisionId", "qa-revision").put("panicFadeMs", 100)
      .put("media",new JSONArray().put(cues.getJSONObject("shared").getJSONObject("mediaAsset")))
      .put("cueOrder", order.put("shared").put("other")).put("hitCueIds", new JSONArray().put("shared")).put("cues", cues);
  }
  private JSONObject target(String cueId, long sourceMs) throws Exception { return new JSONObject().put("cueId", cueId).put("positionMs", sourceMs); }
  private void verifyRate(double rate) throws Exception {
    prepare(snapshot(rate, false)); OwnerRead silent = read(); check(silent.voices.isEmpty() && silent.state.optString("phase").equals("ready"), "Rehearsal preparation was not silent");
    accepted(1, "GO", null); starts(1); accepted(2, "TRIGGER_HIT", new JSONObject().put("cueId", "shared")); starts(2); accepted(3, "PAUSE", null);
    OwnerRead before = read(); paused(before, 2, rate); check(before.primary().mainOwned && !before.other().mainOwned, "Expected one main and one independent same-cue Hit");
    String hitId = before.other().id, primaryId = before.primary().id; long relative = before.other().position < 10000 ? 14123 : 1123;
    accepted(4, "SEEK_REHEARSAL", target("shared", 5000 + relative)); OwnerRead after = read(); paused(after, 2, rate);
    check(Math.abs(after.primary().position-relative) <= 1, "Main seek did not use precise absolute source time"); unchanged(before, after, hitId);
    SystemClock.sleep(100); OwnerRead still = read(); paused(still, 2, rate); unchanged(after, still, hitId); unchanged(after, still, primaryId);
    record("paused same-cue isolation " + rate, after); passed.add("Paused same-cue main seek isolates Hit and preserves " + rate + "x rate");

    accepted(5, "SEEK_REHEARSAL", target("shared", 0)); OwnerRead low = read(); check(low.primary().position == 0, "Seek did not clamp to trim start"); unchanged(before, low, hitId);
    accepted(6, "SEEK_REHEARSAL", target("shared", Long.MAX_VALUE)); OwnerRead high = read(); check(high.primary().position == 19999, "Seek did not clamp to trim end minus one millisecond"); unchanged(before, high, hitId);
    record("source trim clamps " + rate, high); passed.add("Millisecond source seek and both trim clamps preserve the Hit at " + rate + "x");

    accepted(7, "SEEK_REHEARSAL", target("shared", 5000 + relative)); accepted(8, "RESUME", null); OwnerRead admitted = read();
    check(!admitted.paused && admitted.voices.size() == 2, "Deliberate resume lost voices");
    // Command acceptance precedes decoder readiness. Establish both real source
    // clocks before measuring rate; buffering must not look like a seek defect.
    until(() -> { OwnerRead sample=read(); for(VoiceRead voice:sample.voices) if(!voice.playing || voice.position<=admitted.byId(voice.id).position) return false; return sample.voices.size()==2; },"both resumed source clocks");
    OwnerRead resumed=read(); SystemClock.sleep(900); OwnerRead moving = read();
    double expected = (moving.monotonicMs-resumed.monotonicMs)*rate;
    check(moving.monotonicMs-resumed.monotonicMs>=800,"Source-clock sample window too short");
    for (VoiceRead voice : resumed.voices) {
      VoiceRead next = moving.byId(voice.id); long advanced=Math.floorMod(next.position-voice.position,20000L);
      check(next.playWhenReady && Math.abs(next.rate-rate)<.001 && advanced>0 && Math.abs(advanced-expected)<=expected*.15+20, "Source-time playback did not resume at saved rate");
    }
    record("deliberate source-clock resume " + rate, moving); passed.add("Both source clocks resume deliberately at " + rate + "x");

    accepted(9, "PAUSE", null); OwnerRead wrongBefore = read(); dispatch(10, "SEEK_REHEARSAL", target("other", 17000)).refused("CUE_NOT_ACTIVE"); OwnerRead wrongAfter = read();
    check(wrongAfter.lastCommandId==9 && ack(10)==null, "Refused different-cue seek advanced the ACK watermark"); paused(wrongAfter,2,rate); unchanged(wrongBefore,wrongAfter,hitId); unchanged(wrongBefore,wrongAfter,primaryId);
    record("different-cue refusal " + rate, wrongAfter); passed.add("Different current cue refuses without ACK or voice movement at " + rate + "x");

    accepted(11, "PREVIOUS", null); OwnerRead hitOnly = read(); check(hitOnly.voices.size()==1 && !hitOnly.voices.get(0).mainOwned && hitOnly.voices.get(0).id.equals(hitId), "Previous did not preserve only the independent Hit");
    OwnerRead onlyBefore=read(); paused(onlyBefore,1,rate); dispatch(12,"SEEK_REHEARSAL",target("shared",18000)).refused("CUE_NOT_ACTIVE"); OwnerRead onlyAfter=read();
    check(onlyAfter.lastCommandId==11 && ack(12)==null && onlyAfter.voices.size()==1, "Hit-only seek was admitted or acknowledged"); paused(onlyAfter,1,rate); unchanged(onlyBefore,onlyAfter,hitId);
    record("Hit-only refusal " + rate, onlyAfter); passed.add("Hit-only same-cue seek refuses without ACK or movement at " + rate + "x"); shutdown();
  }
  private void verifyCarriedMain() throws Exception {
    prepare(snapshot(1, true)); accepted(1,"GO",null); starts(1); accepted(2,"GO",null); starts(2); accepted(3,"PAUSE",null);
    OwnerRead before=read(); paused(before,2,1); check(before.primary().mainOwned && before.other().mainOwned && before.other().cueId.equals("shared"), "Expected same-cue carried group voice");
    accepted(4,"SEEK_REHEARSAL",target("shared",17123)); OwnerRead after=read(); paused(after,2,1); check(after.primary().position==12123,"Primary source position incorrect"); unchanged(before,after,before.other().id);
    record("legacy carried same-cue main sequence",after); passed.add("Legacy same-cue carried group voice remains untouched by primary seek"); shutdown();
  }
  private void synthesize() throws Exception {
    int samples=48000*30; ByteBuffer bytes=ByteBuffer.allocate(44+samples*2).order(ByteOrder.LITTLE_ENDIAN);
    bytes.put("RIFF".getBytes("US-ASCII")).putInt(bytes.capacity()-8).put("WAVEfmt ".getBytes("US-ASCII")).putInt(16).putShort((short)1).putShort((short)1)
      .putInt(48000).putInt(96000).putShort((short)2).putShort((short)16).put("data".getBytes("US-ASCII")).putInt(samples*2);
    // Zero PCM and -96 dB cue gain; this probe proves state, never acoustic output.
    audio=bytes.array(); fixtureHash=hex(MessageDigest.getInstance("SHA-256").digest(audio));
    fixture=new File(context.getFilesDir(),"rehearsal-seek-qa-"+token+".wav").getCanonicalFile();
    check(fixture.getParentFile().equals(context.getFilesDir().getCanonicalFile()) && fixture.createNewFile(),"Preserve an existing fixture"); ownsFixture=true;
    try(FileOutputStream output=new FileOutputStream(fixture)){output.write(audio);output.getFD().sync();} check(hash(fixture).equals(fixtureHash),"Fixture checksum differs");
  }
  @Override public void onStart() {
    Bundle result=new Bundle(); int code=1; String expected="";
    try {
      deadline=SystemClock.elapsedRealtime()+45000; token=arguments.getString("token",""); check(token.matches("[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}"),"Fresh UUID token required");
      context=getTargetContext(); check(arguments.getString("expectedPackage","").equals("app.showcontrol.working") && context.getPackageName().equals("app.showcontrol.working"),"Wrong target package");
      expected=arguments.getString("expectedApkSha256",""); check(expected.matches("[A-F0-9]{64}") && hash(new File(context.getApplicationInfo().sourceDir)).equals(expected),"Installed APK differs");
      showPrefix="qa-rehearsal-seek-"+token+"-";showId=showPrefix+"idle";loader=context.getClassLoader(); runtime=loader.loadClass("app.showcontrol.audio.ShowAudioRuntime").getField("INSTANCE").get(null); unit=loader.loadClass("kotlin.Unit").getField("INSTANCE").get(null);
      emitter=function(1,args->{}); absent();
      Object coordinator=loader.loadClass("app.showcontrol.audio.NativeRemoteCoordinator").getField("INSTANCE").get(null);
      check(invoke(coordinator,"captureIdleEpoch")!=null,"Preserve native admission; begin idle only"); originalLibrary=libraryDigest(); synthesize();
      Intent launch=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()); check(launch!=null,"Missing launcher"); context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); waitForIdleSync(); absent();
      if(Build.VERSION.SDK_INT>=33) context.registerReceiver(receiver,new IntentFilter("app.showcontrol.RUN_STATE"),Context.RECEIVER_NOT_EXPORTED); else context.registerReceiver(receiver,new IntentFilter("app.showcontrol.RUN_STATE")); receiverRegistered=true;
      verifyRate(.7); verifyRate(2); verifyCarriedMain(); check(passed.size()==11,"Missing native cases"); result.putString("targetSha256",expected); code=-1;
    } catch(Throwable error) { result.putString("failure",error.toString());result.putString("failureDetails",failureDetails(error)); }
    finally {
      cleaning=true;
      try { if(ownsSession) shutdown(); if(runtime!=null) absent(); result.putBoolean("nativeOwnerReleased",runtime!=null); }
      catch(Exception error){result.putString("cleanupFailure",error.toString());result.putString("cleanupFailureDetails",failureDetails(error));code=1;}
      try { if(receiverRegistered) context.unregisterReceiver(receiver); }
      catch(Exception error){result.putString("cleanupFailure",error.toString());result.putString("cleanupFailureDetails",failureDetails(error));code=1;}
      try { if(originalLibrary!=null){String after=libraryDigest();result.putString("libraryBeforeSha256",originalLibrary);result.putString("libraryAfterSha256",after);check(originalLibrary.equals(after),"Original canonical library tables/settings changed; preserve evidence");result.putBoolean("libraryTablesUnchanged",true);} }
      catch(Exception error){result.putString("cleanupFailure",error.toString());result.putString("cleanupFailureDetails",failureDetails(error));code=1;}
      try { if(ownsFixture && fixture.exists()){if(runtime!=null)absent();check(hash(fixture).equals(fixtureHash),"Preserve changed fixture");check(fixture.delete(),"Owned fixture deletion failed");}result.putBoolean("ownedFilesRemoved",!ownsFixture||!fixture.exists()); }
      catch(Exception error){result.putString("cleanupFailure",error.toString());result.putString("cleanupFailureDetails",failureDetails(error));code=1;}
      result.putInt("casesPassed",passed.size());result.putString("cases",new JSONArray(passed).toString());result.putString("observations",observations.toString());result.putString("lastSafeObservation",lastSafeObservation);result.putString("commandEvents",new JSONArray(commandEvents).toString());result.putInt("nativeEvents",totalEvents.get());result.putString("fixtureSha256",fixtureHash);result.putString("originalsScope","8 canonical SQLite tables including library_settings; excludes media bytes and secure/shared preferences");result.putString("librarySnapshot","API 35 read-only SQLite transaction includes committed WAL pages");result.putBoolean("passed",code==-1);finish(code,result);
    }
  }
}
