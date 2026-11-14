package app.showcontrol.libraryrecoveryprobe;

import android.app.Instrumentation;
import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

/** Separate same-test-signer audit; never registered or shipped in the product. */
public final class LibraryRecoveryProbe extends Instrumentation {
  private Bundle arguments;
  private Context context;
  private SQLiteDatabase database;
  private File library;
  private String token, prefix, audioHash, imageHash;
  private static void require(boolean value, String message) { if (!value) throw new IllegalStateException(message); }
  private static String digest(File file) throws Exception {
    return digest(new FileInputStream(file));
  }
  private static String digest(InputStream stream) throws Exception {
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream input = stream) { byte[] bytes = new byte[65536]; int count; while ((count = input.read(bytes)) != -1) hash.update(bytes, 0, count); }
    StringBuilder result = new StringBuilder(); for (byte value : hash.digest()) result.append(String.format(Locale.ROOT, "%02x", value)); return result.toString();
  }
  private long count(String query) { try (Cursor cursor = database.rawQuery(query, null)) { require(cursor.moveToFirst(), "Missing count"); return cursor.getLong(0); } }
  private JSONObject setting(String key) throws Exception {
    try (Cursor cursor = database.rawQuery("SELECT value_json FROM library_settings WHERE key = ?", new String[]{key})) { require(cursor.moveToFirst(), "Missing setting"); return new JSONObject(cursor.getString(0)); }
  }
  private void media(JSONObject asset, String hash, String directory) throws Exception {
    require(asset.getString("checksumSha256").equals(hash), "Unexpected media checksum");
    android.net.Uri uri = android.net.Uri.parse(asset.getString("localUri")); require("file".equals(uri.getScheme()) && (uri.getAuthority() == null || uri.getAuthority().isEmpty()), "Nonlocal media URI");
    File file = new File(uri.getPath()).getCanonicalFile();
    require(file.getParentFile().equals(new File(library, directory).getCanonicalFile()) && file.isFile() && file.length() == asset.getLong("bytes") && digest(file).equals(hash), "Managed media integrity changed");
  }
  private void audit(int expected, Bundle result) throws Exception {
    require(expected == 1 || expected == 2 || expected == 4, "Unexpected fixture count");
    require(count("PRAGMA user_version") == 3, "Unexpected schema");
    try (Cursor cursor = database.rawQuery("PRAGMA quick_check", null)) { require(cursor.moveToFirst() && cursor.getString(0).equals("ok") && !cursor.moveToNext(), "Integrity not observed"); }
    require(count("SELECT count(*) FROM shows") == expected && count("SELECT count(*) FROM deleted_shows") == 0 && count("SELECT count(*) FROM assistant_prompts") == 0, "Unexpected nonfixture work");
    Set<String> showIds = new HashSet<>(), setIds = new HashSet<>(), profileIds = new HashSet<>();
    JSONObject selection = setting("selection"); boolean selected = false;
    try (Cursor cursor = database.rawQuery("SELECT id, document_json FROM shows", null)) {
      while (cursor.moveToNext()) {
        JSONObject show = new JSONObject(cursor.getString(1));
        require(show.getString("name").equals(prefix) && show.getString("id").equals(cursor.getString(0)) && showIds.add(show.getString("id")), "Unexpected show identity");
        JSONArray sets = show.getJSONArray("sets"); require(sets.length() == 2, "Sets lost");
        JSONObject main = sets.getJSONObject(0), alternate = sets.getJSONObject(1);
        require(setIds.add(main.getString("id")) && setIds.add(alternate.getString("id")), "Playlist identities were overwritten across restores");
        require(main.getString("name").equals(prefix + " Main") && alternate.getString("name").equals(prefix + " Alternate") && main.getString("transportMode").equals("oms") && alternate.getString("transportMode").equals("oms"), "Playlist metadata changed");
        require(main.getJSONArray("cueOrder").length() == 2 && alternate.getJSONArray("cueOrder").length() == 1 && main.getJSONArray("hitCueIds").length() == 1 && alternate.getJSONArray("hitCueIds").length() == 1, "Song/Hit order changed");
        require(alternate.getJSONArray("cueOrder").getString(0).equals(main.getJSONArray("cueOrder").getString(1)) && alternate.getJSONArray("hitCueIds").getString(0).equals(main.getJSONArray("hitCueIds").getString(0)), "Shared cue references changed");
        JSONObject cues = show.getJSONObject("cues"); require(cues.length() == 3, "Cue count changed");
        // The portable contract scopes cue IDs to each show. Repeated imports
        // may retain those IDs while independent show/set/revision IDs change.
        Iterator<String> keys = cues.keys(); while (keys.hasNext()) { String key = keys.next(); require(cues.getJSONObject(key).getString("id").equals(key), "Cue identity differs from its show-scoped key"); }
        JSONObject first = cues.getJSONObject(main.getJSONArray("cueOrder").getString(0)), second = cues.getJSONObject(main.getJSONArray("cueOrder").getString(1));
        require(first.getInt("trimInMs") == 500 && first.getInt("trimOutMs") == 6500 && first.getDouble("gainDb") == -24 && first.getDouble("playbackRate") == 1.25 && first.getInt("preWaitMs") == 600 && first.getBoolean("crossfadeEnabled") && first.getInt("crossfadeMs") == 2000 && !first.getBoolean("autoPlay"), "Opening tuning changed");
        require(second.getDouble("playbackRate") == 0.7 && second.getBoolean("autoPlay") && second.getString("colorToken").equals("blue"), "Finale tuning changed");
        JSONObject assets = show.getJSONObject("media"), visuals = show.getJSONObject("visualAssets"); require(assets.length() == 1 && visuals.length() == 1, "Payload deduplication changed");
        JSONObject audio = assets.getJSONObject(assets.keys().next()), image = visuals.getJSONObject(visuals.keys().next());
        media(audio, audioHash, "media"); media(image, imageHash, "visuals");
        require(image.getString("kind").equals("image") && image.getInt("width") == 4 && image.getInt("height") == 4 && first.getString("artworkAssetId").equals(image.getString("id")) && second.getString("visualAssetId").equals(image.getString("id")) && show.getString("fallbackVisualAssetId").equals(image.getString("id")), "Visual references changed");
        JSONArray rules = show.getJSONArray("voiceRules"); require(rules.length() == 1, "Voice data lost"); JSONObject rule = rules.getJSONObject(0);
        require(!rule.getBoolean("enabled") && rule.getInt("delayMs") == 4000 && rule.getString("cueId").equals(first.getString("id")) && rule.getJSONObject("action").getString("type").equals("PLAY") && rule.getJSONObject("action").getString("cueId").equals(second.getString("id")), "Scoped rule references changed");
        require(profileIds.add(show.getString("controllerProfileId")), "Controller profile was overwritten");
        if (selection.getString("showId").equals(show.getString("id"))) { require(selection.getString("setId").equals(alternate.getString("id")), "Selected playlist changed"); selected = true; }
      }
    }
    require(selected && count("SELECT count(*) FROM controller_profiles") == expected && count("SELECT count(*) FROM show_revisions") == expected && count("SELECT count(*) FROM media_assets") == 1, "Restore identities/revisions changed");
    try (Cursor cursor = database.rawQuery("SELECT profile_json FROM controller_profiles", null)) {
      while (cursor.moveToNext()) {
        JSONObject profile = new JSONObject(cursor.getString(0)); require(profileIds.contains(profile.getString("id")) && profile.getString("name").equals(prefix + " Remote"), "Unknown controller profile");
        JSONArray bindings = profile.getJSONArray("bindings"); require(bindings.length() == 2, "Safety bindings lost"); Set<String> commands = new HashSet<>();
        for (int index = 0; index < bindings.length(); index++) { JSONObject binding = bindings.getJSONObject(index); require(binding.getString("adapterId").equals("unbound") && binding.getString("deviceId").matches("logical-device-[0-9]+"), "Controller credentials were not unbound"); commands.add(binding.getJSONObject("command").getString("type")); }
        require(commands.contains("GO") && commands.contains("PANIC_FADE"), "Safety mappings changed");
      }
    }
    JSONObject preferences = setting("preferences"); require(preferences.getString("locale").equals("en") && preferences.getString("theme").equals("purpleNight") && preferences.getBoolean("onboardingCompleted") && !preferences.getBoolean("externalDisplayEnabled"), "Portable safety preferences changed");
    File[] staging = new File(library, "staging").listFiles(); require(staging != null && staging.length == 0, "Residual staging files");
    result.putInt("shows", expected); result.putBoolean("tuningAndReferencesRetained", true); result.putBoolean("cueIdsScopedToShow", true); result.putBoolean("portableMappingsUnbound", true); result.putBoolean("selectionRetained", true); result.putBoolean("stagingEmpty", true); result.putBoolean("readOnlyDatabase", true);
  }
  private void copyExport(Bundle result) throws Exception {
    File[] files = new File(library, "backups").listFiles((directory, name) -> name.matches("Show-Control-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-f0-9-]{36}\\.zip"));
    require(files != null && files.length == 1 && files[0].isFile() && files[0].getCanonicalFile().getParentFile().equals(new File(library, "backups").getCanonicalFile()), "Expected one owned saved archive");
    String relative = Environment.DIRECTORY_DOWNLOADS + "/library-load-" + token + "/", name = "roundtrip.zip";
    try (Cursor existing = context.getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, new String[]{MediaStore.MediaColumns._ID}, MediaStore.MediaColumns.RELATIVE_PATH + " = ? AND " + MediaStore.MediaColumns.DISPLAY_NAME + " = ?", new String[]{relative, name}, null)) {
      require(existing != null && !existing.moveToFirst(), "Preserve existing public export copy");
    }
    ContentValues values = new ContentValues(); values.put(MediaStore.MediaColumns.DISPLAY_NAME, name); values.put(MediaStore.MediaColumns.RELATIVE_PATH, relative); values.put(MediaStore.MediaColumns.MIME_TYPE, "application/zip"); values.put(MediaStore.MediaColumns.IS_PENDING, 1);
    android.net.Uri output = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values); require(output != null, "Public export destination unavailable"); boolean published = false;
    try {
      try (InputStream input = new FileInputStream(files[0]); OutputStream sink = context.getContentResolver().openOutputStream(output, "w")) {
        require(sink != null, "Public export writer unavailable"); byte[] bytes = new byte[65536]; int count; while ((count = input.read(bytes)) != -1) sink.write(bytes, 0, count);
      }
      InputStream copied = context.getContentResolver().openInputStream(output); require(copied != null && digest(files[0]).equals(digest(copied)), "Public export copy changed");
      ContentValues complete = new ContentValues(); complete.put(MediaStore.MediaColumns.IS_PENDING, 0); require(context.getContentResolver().update(output, complete, null, null) == 1, "Public copy could not be published"); published = true;
      result.putString("exportUri", output.toString()); result.putString("exportPath", new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "library-load-" + token + "/" + name).getAbsolutePath()); result.putString("exportSha256", digest(files[0]).toUpperCase(Locale.ROOT)); result.putLong("exportBytes", files[0].length());
    } finally {
      if (!published) try { context.getContentResolver().delete(output, null, null); }
      catch (Throwable cleanup) { result.putBoolean("unpublishedCopyCleanupFailed", true); /* Preserve the original copy/publication error. */ }
    }
  }
  @Override public void onCreate(Bundle args) { arguments = args; start(); }
  @Override public void onStart() {
    Bundle result = new Bundle(); int code = 1;
    try {
      context = getTargetContext(); require(context.getPackageName().equals("app.showcontrol.working"), "Wrong target");
      token = arguments.getString("token", ""); require(token.matches("[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}"), "Wrong token"); prefix = "QA Recovery " + token.substring(0, 8);
      audioHash = arguments.getString("audioSha256", ""); imageHash = arguments.getString("imageSha256", ""); require(audioHash.matches("[a-f0-9]{64}") && imageHash.matches("[a-f0-9]{64}"), "Missing fixture hashes");
      String expected = arguments.getString("expectedApkSha256", ""); require(expected.matches("[A-F0-9]{64}") && digest(new File(context.getApplicationInfo().sourceDir)).equalsIgnoreCase(expected), "Target APK mismatch");
      library = new File(context.getFilesDir(), "show-control-library").getCanonicalFile(); require(library.getParentFile().equals(context.getFilesDir().getCanonicalFile()), "Library escaped");
      database = SQLiteDatabase.openDatabase(new File(library, "library.db").getPath(), null, SQLiteDatabase.OPEN_READONLY);
      audit(Integer.parseInt(arguments.getString("shows", "0")), result);
      String operation = arguments.getString("operation", ""); require(operation.equals("audit") || operation.equals("copy-export"), "Unsupported operation");
      if (operation.equals("copy-export")) copyExport(result);
      result.putString("operation", operation); result.putString("targetSha256", expected); result.putBoolean("passed", true); code = -1;
    } catch (Throwable error) { result.putBoolean("passed", false); result.putString("failure", error.getClass().getSimpleName() + ": " + error.getMessage()); }
    finally {
      try { if (database != null) database.close(); }
      catch (Throwable cleanup) { result.putBoolean("passed", false); result.putString("closeFailure", cleanup.getClass().getSimpleName()); code = 1; }
      finish(code, result);
    }
  }
}
