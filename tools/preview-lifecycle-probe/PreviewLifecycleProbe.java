package app.showcontrol.previewprobe;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
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
import org.json.*;

/** Separate same-test-signer instrument. No product hook, library writes or network. */
public final class PreviewLifecycleProbe extends Instrumentation {
  private Bundle arguments;
  private Object runtime, unit, emitter;
  private ClassLoader loader;
  private Context context;
  private File fixture;
  private String token, fixtureHash;
  private String originalLibrary;
  private byte[] audio;
  private boolean ownsSession, ownsFixture;
  private final List<String> passed = new ArrayList<>();
  private final List<String> events = new CopyOnWriteArrayList<>();
  @Override public void onCreate(Bundle args) { arguments = args; start(); }
  private static void check(boolean condition, String detail) { if (!condition) throw new IllegalStateException(detail); }
  private static String digest(byte[] bytes) throws Exception {
    StringBuilder out = new StringBuilder();
    for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) out.append(String.format(Locale.ROOT, "%02X", value));
    return out.toString();
  }
  private static String hash(File file) throws Exception {
    check(file.isFile() && file.length() <= 200_000_000, "Unexpected checksum input");
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) { byte[] bytes = new byte[65536]; int size; while ((size = input.read(bytes)) != -1) hash.update(bytes, 0, size); }
    StringBuilder out = new StringBuilder(); for (byte value : hash.digest()) out.append(String.format(Locale.ROOT, "%02X", value)); return out.toString();
  }
  private String libraryDigest() throws Exception {
    File library = new File(context.getFilesDir(),"show-control-library/library.db").getCanonicalFile();
    check(library.isFile() && library.getPath().startsWith(context.getFilesDir().getCanonicalPath()+File.separator),"Expected initialized local library");
    MessageDigest digest=MessageDigest.getInstance("SHA-256"); long bytes=0; int cells=0;
    try(SQLiteDatabase db=SQLiteDatabase.openDatabase(library.getPath(),null,SQLiteDatabase.OPEN_READONLY)) {
      for(String table:new String[]{"shows","media_assets","controller_profiles","show_revisions","deleted_shows","library_settings","migration_ledger","assistant_prompts"}) {
        String key=table.equals("library_settings")?"key":table.equals("migration_ledger")?"version":"id";
        digest.update(table.getBytes("UTF-8"));
        try(Cursor cursor=db.rawQuery("SELECT * FROM "+table+" ORDER BY "+key,null)) {
          while(cursor.moveToNext()) for(int column=0;column<cursor.getColumnCount();column++) {
            byte[] value=(cursor.isNull(column)?"<null>":cursor.getString(column)).getBytes("UTF-8"); bytes+=value.length;
            check(bytes<=32_000_000 && ++cells<=100000,"Unexpected original QA library size; preserve it");
            digest.update((value.length+":").getBytes("UTF-8")); digest.update(value);
          }
        }
      }
    }
    StringBuilder out=new StringBuilder(); for(byte value:digest.digest()) out.append(String.format(Locale.ROOT,"%02X",value)); return out.toString();
  }
  private Object field(Object target, String name) throws Exception { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(target); }
  private Object owner() throws Exception { return field(runtime, "service"); }
  private void absent() throws Exception { check(owner() == null && field(runtime, "startingService") == null, "Native owner remains after completion"); }
  private int voices(Object service) throws Exception {
    CountDownLatch done = new CountDownLatch(1); AtomicInteger count = new AtomicInteger(-1);
    check(((Handler)field(service,"commands")).post(() -> { try { count.set(((Map<?,?>)field(service,"voices")).size()); } catch(Exception ignored) { } finally { done.countDown(); } }), "Owner closed during voice observation");
    check(done.await(3,TimeUnit.SECONDS) && count.get()>=0,"Voice observation pending"); return count.get();
  }
  private interface Callback { void invoke(Object[] args); }
  private Object function(int arity, Callback callback) throws Exception {
    Class<?> type = loader.loadClass("kotlin.jvm.functions.Function" + arity);
    return Proxy.newProxyInstance(loader, new Class<?>[]{type}, (proxy, method, args) -> {
      if (method.getName().equals("invoke")) { callback.invoke(args == null ? new Object[0] : args); return unit; }
      if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
      if (method.getName().equals("equals")) return proxy == args[0];
      return "Synthetic lifecycle callback";
    });
  }
  private Object invoke(Object target, String name, Object... args) throws Exception {
    List<Method> candidates = new ArrayList<>();
    for (Method method : target.getClass().getMethods()) if ((method.getName().equals(name) || method.getName().startsWith(name + "$")) && method.getParameterTypes().length == args.length) candidates.add(method);
    check(candidates.size() == 1, "Native method boundary changed: " + name);
    try { return candidates.get(0).invoke(target, args); }
    catch (InvocationTargetException error) { throw new IllegalStateException("Native invocation failed: " + name, error.getCause()); }
  }
  private final class Call {
    final CountDownLatch completed = new CountDownLatch(1);
    final AtomicInteger count = new AtomicInteger();
    final Object resolve, reject;
    volatile String error;
    Call() throws Exception {
      resolve = function(0, args -> { count.incrementAndGet(); completed.countDown(); });
      reject = function(2, args -> { error = String.valueOf(args[0]); count.incrementAndGet(); completed.countDown(); });
    }
    void await() throws Exception { check(completed.await(10, TimeUnit.SECONDS), "Native callback still pending"); check(count.get() == 1, "Native callback completed more than once"); }
    void success() throws Exception { await(); check(error == null, "Native operation rejected: " + error); }
    void refused(String expected) throws Exception { await(); check(expected.equals(error), "Expected " + expected + ", observed " + error); }
  }
  private Call preview(JSONObject cue, boolean paused) throws Exception { Call call = new Call(); invoke(runtime, "preview", context, cue.toString(), 0L, paused, emitter, call.resolve, call.reject); return call; }
  private Call prepare(JSONObject snapshot) throws Exception { Call call = new Call(); invoke(runtime, "prepare", context, snapshot.toString(), emitter, call.resolve, call.reject); return call; }
  private Call stop() throws Exception { Call call = new Call(); invoke(runtime, "stopPreview", call.resolve); return call; }
  private void shutdown() throws Exception { Call call = new Call(); invoke(runtime, "shutdown", call.resolve, call.reject); call.success(); absent(); }
  private final class Hold implements AutoCloseable {
    final CountDownLatch release = new CountDownLatch(1);
    Hold(Object service) throws Exception {
      CountDownLatch entered = new CountDownLatch(1);
      check(((Handler)field(service, "commands")).post(() -> { entered.countDown(); try { release.await(5, TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); } }), "Owner queue closed");
      check(entered.await(3, TimeUnit.SECONDS), "Owner queue did not enter hold");
    }
    @Override public void close() { release.countDown(); }
  }
  private JSONObject cue(int end) throws Exception {
    JSONObject media = new JSONObject().put("id", "qa-media-" + token).put("localUri", fixture.toURI().toString().replace("file:/", "file:///"))
      .put("checksumSha256", fixtureHash.toLowerCase(Locale.ROOT)).put("bytes", audio.length).put("durationMs", 2000).put("codec", "wav").put("channels", 1).put("sampleRate", 48000);
    return new JSONObject().put("id", "qa-cue-" + token).put("name", "Synthetic lifecycle cue").put("type", "audio").put("tags", new JSONArray().put("qa-preview-lifecycle"))
      .put("mediaAssetId", media.getString("id")).put("mediaAsset", media).put("trimInMs", 0).put("trimOutMs", end)
      .put("gainDb", -96).put("fadeInMs", 0).put("fadeOutMs", 0).put("fadeCurve", "smooth").put("preWaitMs", 0)
      .put("endBehavior", "loop").put("playbackRate", 1).put("autoPlay", false).put("crossfadeEnabled", false).put("crossfadeMs", 2000);
  }
  private JSONObject snapshot(JSONObject cue) throws Exception {
    return new JSONObject().put("schemaVersion", 2).put("transportMode", "oms").put("sessionPurpose", "performance").put("voiceLimit", 8)
      .put("showId", "qa-preview-" + token).put("setId", "qa-set").put("revisionId", "qa-revision").put("panicFadeMs", 100)
      .put("cueOrder", new JSONArray().put(cue.getString("id"))).put("cues", new JSONObject().put(cue.getString("id"), cue));
  }
  private void synthesize() throws Exception {
    int samples = 48000 * 2;
    ByteBuffer bytes = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN);
    bytes.put("RIFF".getBytes("US-ASCII")).putInt(bytes.capacity()-8).put("WAVEfmt ".getBytes("US-ASCII")).putInt(16).putShort((short)1).putShort((short)1)
      .putInt(48000).putInt(96000).putShort((short)2).putShort((short)16).put("data".getBytes("US-ASCII")).putInt(samples*2);
    for (int index=0; index<samples; index++) bytes.putShort((short)Math.round(200 * Math.sin(2*Math.PI*440*index/48000)));
    audio = bytes.array(); fixtureHash = digest(audio);
    fixture = new File(context.getFilesDir(), "preview-lifecycle-qa-" + token + ".wav").getCanonicalFile();
    check(fixture.getParentFile().equals(context.getFilesDir().getCanonicalFile()) && fixture.createNewFile(), "Preserve an existing fixture"); ownsFixture=true;
    try (FileOutputStream output = new FileOutputStream(fixture)) { output.write(audio); output.getFD().sync(); }
    check(hash(fixture).equals(fixtureHash), "Synthetic fixture write failed");
  }
  @Override public void onStart() {
    Bundle result = new Bundle(); int code = 1;
    try {
      token = arguments.getString("token", ""); check(token.matches("[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}"), "Fresh token required");
      context = getTargetContext(); check(context.getPackageName().equals("app.showcontrol.working"), "Wrong target");
      String expected = arguments.getString("expectedApkSha256", ""); check(expected.matches("[A-F0-9]{64}") && hash(new File(context.getApplicationInfo().sourceDir)).equals(expected), "Installed APK differs");
      loader = context.getClassLoader(); runtime = loader.loadClass("app.showcontrol.audio.ShowAudioRuntime").getField("INSTANCE").get(null);
      unit = loader.loadClass("kotlin.Unit").getField("INSTANCE").get(null);
      emitter = function(1, args -> { if (args[0] instanceof Map) events.add(String.valueOf(((Map<?,?>)args[0]).get("type"))); });
      absent(); ownsSession=true; originalLibrary=libraryDigest(); synthesize();
      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()); check(launch != null, "Missing launcher");
      context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); waitForIdleSync();
      stop().success(); absent(); passed.add("Idle Stop creates no owner");

      JSONObject cue = cue(1500), show = snapshot(cue);
      preview(cue, true).success(); Object first = owner(); check(first != null && Boolean.TRUE.equals(field(first,"previewMode")) && Boolean.TRUE.equals(field(first,"enginePaused")), "Paused audition was not prepared");
      stop().success(); absent(); check(Boolean.TRUE.equals(field(first,"destroyed")), "Stop resolved before destruction"); passed.add("Paused Stop awaits service destruction");
      preview(cue, false).success(); SystemClock.sleep(120); stop().success(); absent(); passed.add("Active Stop releases service");
      preview(cue(250), false).success(); Object natural = owner(); long end = SystemClock.elapsedRealtime()+5000;
      while (SystemClock.elapsedRealtime()<end && voices(natural)>0) SystemClock.sleep(25);
      check(voices(natural)==0, "Audition did not end naturally"); stop().success(); absent(); passed.add("Natural-end Stop releases idle owner");
      preview(cue,true).success(); Call a=stop(), b=stop(); a.success(); b.success(); absent(); passed.add("Duplicate Stop waits for one destroyed owner");

      preview(cue,true).success(); Object closing=owner(); Call closed, refusedMain, refusedPreview;
      try (Hold held = new Hold(closing)) { closed=stop(); refusedMain=prepare(show); refusedPreview=preview(cue,true); }
      closed.success(); refusedMain.refused("OWNER_SHUTTING_DOWN"); refusedPreview.refused("OWNER_SHUTTING_DOWN"); absent(); passed.add("Stop-first queue rejects both late preparations");
      prepare(show).success(); check(owner()!=null && !Boolean.TRUE.equals(field(owner(),"previewMode")), "Deliberate main retry did not prepare"); shutdown(); passed.add("Fresh main retry succeeds silently");

      preview(cue,true).success(); Object winning=owner(); Call admittedMain, harmless;
      try (Hold held = new Hold(winning)) { admittedMain=prepare(show); harmless=stop(); }
      admittedMain.success(); harmless.success(); check(owner()==winning && !Boolean.TRUE.equals(field(winning,"previewMode")) && !Boolean.TRUE.equals(field(winning,"destroyed")), "Preview Stop destroyed an admitted main show");
      events.clear(); Call go=new Call(); invoke(runtime,"dispatch",new JSONObject().put("id",1).put("type","GO").toString(),go.resolve,go.reject); go.success();
      long started=SystemClock.elapsedRealtime()+5000; while(SystemClock.elapsedRealtime()<started && !events.contains("VOICE_START")) SystemClock.sleep(25);
      check(events.contains("VOICE_START") && voices(winning)>0,"Main GO did not start its voice"); stop().success(); check(owner()==winning && voices(winning)>0,"Preview Stop altered main playback");
      shutdown(); passed.add("Prepare-first and playing main survive preview Stop");

      Call stalePreview=new Call(); invoke(closing,"previewCue",cue.toString(),0L,true,stalePreview.resolve,stalePreview.reject); stalePreview.refused("OWNER_SHUTTING_DOWN");
      Call stalePrepare=new Call(); invoke(closing,"prepareSnapshot",show.toString(),stalePrepare.resolve,stalePrepare.reject); stalePrepare.refused("OWNER_SHUTTING_DOWN"); absent(); passed.add("Destroyed queue rejects stale requests without hanging");
      JSONObject invalid=cue(1500); invalid.getJSONObject("mediaAsset").put("localUri",fixture.toURI().toString()+"-missing");
      Call failed=preview(invalid,true); failed.refused("PREVIEW_FAILED"); absent(); passed.add("Invalid-media failure releases owner before Retry");
      preview(cue,true).success(); stop().success(); absent(); passed.add("Fresh audition retry works after failure");
      Call failedMain=prepare(new JSONObject().put("schemaVersion",99)); failedMain.refused("INVALID_SNAPSHOT"); absent();
      preview(cue,true).success(); stop().success(); absent(); passed.add("Failed main preparation detaches before a fresh audition");
      result.putString("targetSha256",expected); code=-1;
    } catch(Throwable error) { result.putString("failure",error.toString()); }
    finally {
      try { if(ownsSession) shutdown(); } catch(Exception error) { result.putString("cleanupFailure",error.toString()); code=1; }
      try { if(originalLibrary!=null) { check(originalLibrary.equals(libraryDigest()),"Original library/preferences changed; preserve evidence"); result.putBoolean("originalsUnchanged",true); } }
      catch(Exception error) { result.putString("cleanupFailure",error.toString()); code=1; }
      try { if(ownsFixture && fixture.exists()) { check(hash(fixture).equals(fixtureHash),"Preserve changed fixture"); check(fixture.delete(),"Owned fixture delete failed"); } result.putBoolean("ownedFilesRemoved",!ownsFixture || !fixture.exists()); }
      catch(Exception error) { result.putString("cleanupFailure",error.toString()); code=1; }
      result.putInt("casesPassed",passed.size()); result.putString("cases",new JSONArray(passed).toString()); result.putBoolean("passed",code==-1); result.putInt("nativeEvents",events.size()); finish(code,result);
    }
  }
}
