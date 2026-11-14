package app.showcontrol.collectionprobe;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.util.AtomicFile;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Separate same-signer fixture tool. Never shipped or registered in the product. */
public final class CollectionProbe extends Instrumentation {
  private Bundle arguments;
  private Context context;
  private String token, prefix;
  private File marker, mediaFile;
  private SQLiteDatabase db;
  private Activity activity;
  private boolean rehearsalMeasurement;
  @Override public void onCreate(Bundle args) { arguments = args; start(); }
  private static void require(boolean okay, String message) { if (!okay) throw new IllegalStateException(message); }
  private static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte value : bytes) out.append(String.format(Locale.ROOT, "%02X", value)); return out.toString(); }
  private static byte[] read(InputStream stream, int maximum) throws Exception {
    try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[65536]; int count;
      while ((count = input.read(buffer)) != -1) { require(output.size() + count <= maximum, "Bounded fixture exceeded"); output.write(buffer, 0, count); }
      return output.toByteArray();
    }
  }
  private static String digest(File file) throws Exception {
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[65536]; int count; while ((count = input.read(buffer)) != -1) hash.update(buffer, 0, count); }
    return hex(hash.digest());
  }
  private String setting(String key) {
    try (Cursor cursor = db.rawQuery("SELECT value_json FROM library_settings WHERE key = ?", new String[]{key})) { return cursor.moveToFirst() ? cursor.getString(0) : null; }
  }
  private long count(String sql, String... args) { try (Cursor cursor = db.rawQuery(sql, args)) { require(cursor.moveToFirst(), "Missing count"); return cursor.getLong(0); } }
  private String originalDigest() throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    for (String table : new String[]{"shows", "deleted_shows", "show_revisions"}) {
      String owner = table.equals("show_revisions") ? "show_id" : "id";
      try (Cursor cursor = db.rawQuery("SELECT * FROM " + table + " WHERE " + owner + " NOT LIKE ? ORDER BY id", new String[]{prefix + "%"})) {
        digest.update(table.getBytes(StandardCharsets.UTF_8));
        while (cursor.moveToNext()) for (int column = 0; column < cursor.getColumnCount(); column++) {
          String value = cursor.isNull(column) ? "<null>" : cursor.getString(column);
          byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
          digest.update((bytes.length + ":").getBytes(StandardCharsets.UTF_8)); digest.update(bytes);
        }
      }
    }
    return hex(digest.digest());
  }
  private void writeMarker(JSONObject value) throws Exception {
    AtomicFile atomic = new AtomicFile(marker); FileOutputStream output = atomic.startWrite();
    try { output.write(value.toString().getBytes(StandardCharsets.UTF_8)); atomic.finishWrite(output); }
    catch (Exception error) { atomic.failWrite(output); throw error; }
  }
  private void insert(String table, ContentValues values) { require(db.insertOrThrow(table, null, values) != -1, "Fixture insert failed"); }
  private static boolean same(String a, String b) { return Objects.equals(a, b); }
  private String mediaUri() throws IOException {
    // Match Expo's document URI without resolving Android's /data/user/0 alias
    // into /data/data. Canonical identity still guards every file operation.
    File logical = new File(new File(context.getFilesDir(), "show-control-library/media"), mediaFile.getName());
    require(logical.getCanonicalFile().equals(mediaFile), "Logical media identity changed");
    return android.net.Uri.fromFile(logical).toString();
  }

  private void seed(JSONObject fixture, String fixtureHash, Bundle result) throws Exception {
    require(!marker.exists() && !new File(marker + ".bak").exists() && !new File(marker + ".new").exists(), "Existing fixture marker; clean it before another seed");
    JSONArray shows = fixture.getJSONArray("shows"); JSONObject media = fixture.getJSONObject("media");
    require(shows.length() == 601, "Unexpected fixture count");
    require(count("SELECT count(*) FROM shows WHERE id LIKE ?", prefix + "%") == 0 && count("SELECT count(*) FROM deleted_shows WHERE id LIKE ?", prefix + "%") == 0 && count("SELECT count(*) FROM show_revisions WHERE show_id LIKE ?", prefix + "%") == 0, "Fixture identity collision");
    require(count("SELECT count(*) FROM media_assets WHERE id = ? OR checksum_sha256 = ?", media.getString("id"), media.getString("checksumSha256")) == 0, "Media identity collision");
    require(!mediaFile.exists(), "Preserve existing canonical media");
    JSONArray ids = new JSONArray(); HashSet<String> unique = new HashSet<>();
    for (int index = 0; index < shows.length(); index++) {
      JSONObject show = shows.getJSONObject(index); String id = show.getString("id");
      require(id.startsWith(prefix) && unique.add(id) && show.getString("revisionId").startsWith(prefix), "Invalid owned show identity"); ids.put(id);
    }
    String before = originalDigest();
    JSONObject record = new JSONObject().put("token", token).put("prefix", prefix).put("fixtureSha256", fixtureHash).put("showIds", ids)
      .put("mediaId", media.getString("id")).put("mediaSha256", media.getString("checksumSha256").toUpperCase(Locale.ROOT))
      .put("mediaUri", mediaUri())
      .put("originalDigest", before).put("selection", setting("selection") == null ? JSONObject.NULL : setting("selection"))
      .put("preferences", setting("preferences") == null ? JSONObject.NULL : setting("preferences"));
    // Intent is durable before file/SQL changes. A failed seed requires deliberate clean.
    writeMarker(record);
    byte[] audio = read(getContext().getAssets().open("tone.wav"), 2000000);
    require(hex(MessageDigest.getInstance("SHA-256").digest(audio)).equals(record.getString("mediaSha256")), "Media fixture changed");
    require(mediaFile.createNewFile(), "Canonical media appeared; preserve it");
    try (FileOutputStream output = new FileOutputStream(mediaFile)) { output.write(audio); output.getFD().sync(); }
    require(digest(mediaFile).equals(record.getString("mediaSha256")), "Staged media checksum mismatch");
    String uri = record.getString("mediaUri");
    require(uri.startsWith("file:///"), "Nonlocal fixture path"); media.put("localUri", uri);
    db.beginTransaction();
    try {
      for (int index = 0; index < shows.length(); index++) {
        JSONObject show = shows.getJSONObject(index);
        if (show.getJSONObject("media").has(media.getString("id"))) show.getJSONObject("media").put(media.getString("id"), media);
        ContentValues row = new ContentValues(); row.put("id", show.getString("id")); row.put("revision_id", show.getString("revisionId")); row.put("name", show.getString("name")); row.put("updated_at", show.getString("updatedAt")); row.put("document_json", show.toString()); insert("shows", row);
        ContentValues revision = new ContentValues(); revision.put("id", show.getString("revisionId")); revision.put("show_id", show.getString("id")); revision.put("created_at", show.getString("updatedAt")); revision.putNull("prompt"); revision.put("document_json", show.toString()); insert("show_revisions", revision);
      }
      ContentValues asset = new ContentValues(); asset.put("id", media.getString("id")); asset.put("checksum_sha256", media.getString("checksumSha256")); asset.put("local_uri", uri); asset.put("bytes", media.getLong("bytes")); asset.put("metadata_json", media.toString()); insert("media_assets", asset);
      require(originalDigest().equals(before), "Original documents changed during seed");
      db.setTransactionSuccessful();
    } finally { db.endTransaction(); }
    result.putInt("ownedShows", shows.length()); result.putInt("songs", shows.getJSONObject(0).getJSONArray("sets").getJSONObject(0).getJSONArray("cueOrder").length());
    result.putInt("hits", shows.getJSONObject(0).getJSONArray("sets").getJSONObject(0).getJSONArray("hitCueIds").length()); result.putBoolean("originalsUnchanged", true);
  }

  private void clean(String fixtureHash, Bundle result) throws Exception {
    require(marker.isFile() || new File(marker + ".bak").isFile(), "Owned marker missing; preserve everything");
    JSONObject record = new JSONObject(new String(read(new AtomicFile(marker).openRead(), 256000), StandardCharsets.UTF_8));
    require(record.getString("token").equals(token) && record.getString("prefix").equals(prefix) && record.getString("fixtureSha256").equals(fixtureHash), "Marker ownership mismatch");
    require(!mediaFile.exists() || digest(mediaFile).equals(record.getString("mediaSha256")), "Canonical file changed; preserve it");
    long assets = count("SELECT count(*) FROM media_assets WHERE id = ?", record.getString("mediaId"));
    // Retain cleanup compatibility with markers written by the earlier probe.
    String uri = record.optString("mediaUri", mediaFile.toURI().toString().replace("file:/", "file:///"));
    require(new File(android.net.Uri.parse(uri).getPath()).getCanonicalFile().equals(mediaFile), "Recorded URI escaped owned media");
    require(assets == 0 || count("SELECT count(*) FROM media_assets WHERE id = ? AND checksum_sha256 = ? AND local_uri = ?", record.getString("mediaId"), record.getString("mediaSha256").toLowerCase(Locale.ROOT), uri) == 1, "Fixture asset identity changed; preserve it");
    require(originalDigest().equals(record.getString("originalDigest")), "Original documents changed; preserve for inspection");
    String preferences = record.isNull("preferences") ? null : record.getString("preferences");
    require(same(preferences, setting("preferences")), "Restore original app preferences before cleanup");
    String selection = setting("selection"); String originalSelection = record.isNull("selection") ? null : record.getString("selection");
    boolean ownsSelection = selection != null && new JSONObject(selection).optString("showId").startsWith(prefix);
    require(ownsSelection || same(selection, originalSelection), "Selection changed outside fixture; preserve it");
    for (String table : new String[]{"shows", "deleted_shows", "show_revisions"}) {
      String owner = table.equals("show_revisions") ? "show_id" : "id";
      require(count("SELECT count(*) FROM " + table + " WHERE " + owner + " NOT LIKE ? AND instr(document_json, ?) > 0", prefix + "%", record.getString("mediaId")) == 0, "Fixture media is referenced outside owned shows");
    }
    require(count("SELECT count(*) FROM assistant_prompts WHERE show_id LIKE ?", prefix + "%") == 0, "Unexpected assistant work; preserve evidence");
    JSONArray ids = record.getJSONArray("showIds"); require(ids.length() == 601, "Marker count changed");
    db.beginTransaction();
    try {
      for (int index = 0; index < ids.length(); index++) {
        String id = ids.getString(index); require(id.startsWith(prefix), "Invalid cleanup identity");
        db.delete("show_revisions", "show_id = ?", new String[]{id}); db.delete("deleted_shows", "id = ?", new String[]{id}); db.delete("shows", "id = ?", new String[]{id});
      }
      db.delete("media_assets", "id = ? AND checksum_sha256 = ?", new String[]{record.getString("mediaId"), record.getString("mediaSha256").toLowerCase(Locale.ROOT)});
      require(count("SELECT count(*) FROM shows WHERE id LIKE ?", prefix + "%") == 0 && count("SELECT count(*) FROM deleted_shows WHERE id LIKE ?", prefix + "%") == 0 && count("SELECT count(*) FROM show_revisions WHERE show_id LIKE ?", prefix + "%") == 0 && count("SELECT count(*) FROM media_assets WHERE id = ?", record.getString("mediaId")) == 0, "Owned database rows remain; retain marker");
      if (ownsSelection) {
        if (originalSelection == null) db.delete("library_settings", "key = ?", new String[]{"selection"});
        else { ContentValues values = new ContentValues(); values.put("value_json", originalSelection); require(db.update("library_settings", values, "key = ?", new String[]{"selection"}) == 1, "Selection restore failed"); }
      }
      require(originalDigest().equals(record.getString("originalDigest")), "Original rows changed during cleanup"); db.setTransactionSuccessful();
    } finally { db.endTransaction(); }
    require(!mediaFile.exists() || mediaFile.delete(), "Owned media cleanup failed; retain marker");
    new AtomicFile(marker).delete(); require(!marker.exists(), "Marker cleanup failed");
    result.putBoolean("originalsUnchanged", true); result.putBoolean("ownedRowsRemoved", count("SELECT count(*) FROM shows WHERE id LIKE ?", prefix + "%") == 0);
    result.putBoolean("ownedFilesRemoved", !mediaFile.exists()); result.putBoolean("selectionRestored", same(setting("selection"), originalSelection));
  }

  private void inspectImport(String fixtureHash, Bundle result) throws Exception {
    JSONObject record = new JSONObject(new String(read(new AtomicFile(marker).openRead(), 256000), StandardCharsets.UTF_8));
    require(record.getString("token").equals(token) && record.getString("fixtureSha256").equals(fixtureHash), "Wrong inspection marker");
    require(originalDigest().equals(record.getString("originalDigest")), "Original rows changed");
    require(same(record.isNull("preferences") ? null : record.getString("preferences"), setting("preferences")), "Original preferences changed");
    JSONObject show;
    try (Cursor cursor = db.rawQuery("SELECT document_json FROM shows WHERE id = ?", new String[]{prefix + "2"})) {
      require(cursor.moveToFirst(), "Owned show missing"); show = new JSONObject(cursor.getString(0));
    }
    JSONArray order = show.getJSONArray("sets").getJSONObject(0).getJSONArray("cueOrder");
    require(order.length() == 1201, "Expected exactly one successful import");
    JSONObject cue = show.getJSONObject("cues").getJSONObject(order.getString(1200));
    require(cue.getString("name").equals("tone") && cue.getString("mediaAssetId").equals(record.getString("mediaId")), "Duplicate import did not reuse media");
    require(cue.getDouble("gainDb") == -18 && cue.getInt("fadeInMs") == 800 && cue.getInt("fadeOutMs") == 1800 && cue.getDouble("playbackRate") == 1 && cue.getInt("preWaitMs") == 0 && cue.getInt("trimInMs") == 0 && !cue.has("trimOutMs"), "New-song tuning changed");
    require(cue.getString("endBehavior").equals("stopAndReadyNext") && !cue.getBoolean("autoPlay") && !cue.getBoolean("crossfadeEnabled") && cue.getInt("crossfadeMs") == 2000, "New-song transport defaults changed");
    require(!cue.has("artworkAssetId") && !cue.has("visualAssetId") && show.optJSONObject("visualAssets").length() == 0 && show.getJSONObject("media").length() == 1, "Failed attachment left saved assets");
    require(count("SELECT count(*) FROM media_assets WHERE checksum_sha256 = ?", record.getString("mediaSha256").toLowerCase(Locale.ROOT)) == 1 && digest(mediaFile).equals(record.getString("mediaSha256")), "Shared canonical asset changed");
    File[] staged = new File(context.getFilesDir(), "show-control-library/staging").listFiles();
    require(staged != null && staged.length == 0, "Staged inspection file remains");
    require(count("SELECT count(*) FROM assistant_prompts WHERE show_id LIKE ?", prefix + "%") == 0, "Unexpected assistant work");
    result.putInt("songs", order.length()); result.putBoolean("defaultsRetained", true); result.putBoolean("sharedMediaRetained", true); result.putBoolean("invalidVisualNotSaved", true); result.putInt("stagingFiles", 0); result.putBoolean("originalsUnchanged", true);
  }

  private void countViews(View view, int[] counts) {
    require(++counts[0] <= 100000, "Unexpected native view count");
    CharSequence label = view.getContentDescription();
    if (label != null && label.toString().equals(rehearsalMeasurement ? "Prepare rehearsal" : "Find a show")) counts[1]++;
    if (label != null && label.toString().matches("Open show · QA Collection Show [0-9]{4}")) counts[2]++;
    if (view instanceof TextView && ((TextView)view).getText().toString().matches("QA Rehearsal (song|Hit) [0-9]{4}")) counts[3]++;
    if (view instanceof ViewGroup) { ViewGroup group = (ViewGroup)view; for (int index = 0; index < group.getChildCount(); index++) countViews(group.getChildAt(index), counts); }
  }
  private void measure(Bundle result) throws Exception {
    if (!rehearsalMeasurement) require(marker.isFile(), "Seed the owned fixture before measuring");
    else {
      try (Cursor cursor = db.rawQuery("SELECT name FROM shows", null)) { while (cursor.moveToNext()) require(cursor.getString(0).matches("QA (Recovery|Rehearsal) [a-f0-9]{8}"), "Rehearsal measurement requires only owned synthetic shows"); }
      JSONObject selection = new JSONObject(setting("selection"));
      try (Cursor cursor = db.rawQuery("SELECT name FROM shows WHERE id = ?", new String[]{selection.getString("showId")})) { require(cursor.moveToFirst() && cursor.getString(0).matches("QA Rehearsal [a-f0-9]{8}"), "Select the synthetic rehearsal show first"); }
    }
    String before = originalDigest(); db.close(); db = null;
    Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()); require(intent != null, "Missing launch activity");
    if (rehearsalMeasurement) intent.setAction(Intent.ACTION_VIEW).setData(android.net.Uri.parse("showcontrol://rehearsal"));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); activity = startActivitySync(intent);
    long deadline = System.nanoTime() + 10000000000L; int[] observed = new int[4];
    do {
      waitForIdleSync(); final int[] current = new int[4];
      runOnMainSync(() -> countViews(activity.getWindow().getDecorView(), current)); observed = current;
      if (observed[1] == 1) break;
      Thread.sleep(100);
    } while (System.nanoTime() < deadline);
    require(observed[1] == 1, "Requested collection did not become readable");
    Thread.sleep(1500); waitForIdleSync(); final int[] settled = new int[4]; runOnMainSync(() -> countViews(activity.getWindow().getDecorView(), settled));
    db = SQLiteDatabase.openDatabase(new File(context.getFilesDir(), "show-control-library/library.db").getPath(), null, rehearsalMeasurement ? SQLiteDatabase.OPEN_READONLY : SQLiteDatabase.OPEN_READWRITE);
    require(originalDigest().equals(before), "Original documents changed during measurement");
    result.putInt("nativeViews", settled[0]); result.putInt("collectionRows", settled[2]); result.putBoolean("originalsUnchanged", true);
    if (rehearsalMeasurement) { result.putInt("rehearsalRows", settled[3]); result.putBoolean("readOnlyMeasurement", true); }
  }

  @Override public void onStart() {
    Bundle result = new Bundle(); int exit = 1;
    try {
      token = arguments.getString("token", ""); require(token.matches("[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}"), "Fresh UUID required"); prefix = "collection-qa-" + token + "-";
      context = getTargetContext(); require(context.getPackageName().equals("app.showcontrol.working"), "Wrong target");
      String apkHash = arguments.getString("expectedApkSha256", ""); require(apkHash.matches("[A-F0-9]{64}") && digest(new File(context.getApplicationInfo().sourceDir)).equals(apkHash), "Target APK mismatch");
      byte[] bytes = read(getContext().getAssets().open("fixture.json"), 4000000); String fixtureHash = hex(MessageDigest.getInstance("SHA-256").digest(bytes));
      require(fixtureHash.equals(arguments.getString("fixtureSha256", "")), "Fixture checksum mismatch");
      JSONObject fixture = new JSONObject(new String(bytes, StandardCharsets.UTF_8)); require(fixture.getString("token").equals(token) && fixture.getString("prefix").equals(prefix), "Fixture identity mismatch");
      File library = new File(context.getFilesDir(), "show-control-library").getCanonicalFile(); require(library.getParentFile().equals(context.getFilesDir().getCanonicalFile()), "Unexpected library path");
      File database = new File(library, "library.db").getCanonicalFile(); require(database.isFile() && database.getParentFile().equals(library), "Expected initialized library");
      marker = new File(context.getFilesDir(), "collection-qa-" + token + ".json").getCanonicalFile(); require(marker.getParentFile().equals(context.getFilesDir().getCanonicalFile()), "Marker escaped");
      mediaFile = new File(new File(library, "media"), fixture.getJSONObject("media").getString("checksumSha256") + ".wav").getCanonicalFile();
      require(mediaFile.getParentFile().equals(new File(library, "media").getCanonicalFile()), "Media escaped");
      String operation = arguments.getString("operation", ""); rehearsalMeasurement = operation.equals("measure-rehearsal");
      db = SQLiteDatabase.openDatabase(database.getPath(), null, rehearsalMeasurement ? SQLiteDatabase.OPEN_READONLY : SQLiteDatabase.OPEN_READWRITE);
      require(count("PRAGMA user_version") == 3, "Unexpected database version");
      try (Cursor timeout = db.rawQuery("PRAGMA busy_timeout = 1000", null)) { require(timeout.moveToFirst() && timeout.getInt(0) == 1000, "Busy timeout unavailable"); }
      if (operation.equals("seed")) seed(fixture, fixtureHash, result); else if (operation.equals("clean")) clean(fixtureHash, result); else if (operation.equals("measure") || rehearsalMeasurement) measure(result); else if (operation.equals("inspect-import")) inspectImport(fixtureHash, result); else throw new IllegalArgumentException("Unsupported fixture operation");
      result.putString("operation", operation); result.putString("targetSha256", apkHash); result.putBoolean("passed", true); exit = -1;
    } catch (Throwable error) { result.putBoolean("passed", false); result.putString("failure", error.getClass().getSimpleName() + ": " + error.getMessage()); }
    finally {
      boolean cleanupOkay = true;
      try { if (db != null) db.close(); }
      catch (Throwable cleanup) { cleanupOkay = false; result.putString("databaseCleanupFailure", cleanup.getClass().getSimpleName()); }
      try { if (activity != null) runOnMainSync(() -> activity.finish()); }
      catch (Throwable cleanup) { cleanupOkay = false; result.putString("activityCleanupFailure", cleanup.getClass().getSimpleName()); }
      if (!cleanupOkay) { exit = 1; result.putBoolean("passed", false); }
      finish(exit, result);
    }
  }
}
