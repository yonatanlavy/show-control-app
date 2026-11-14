package app.showcontrol.nativefaultprobe;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.system.Os;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

/** Separate test APK. Never linked into or exported by the production application. */
public final class FaultProbe extends Instrumentation {
  private static final String EXPECTED = "ef235e9eaef2e5e9f27f4d34cd7ceb6f0b82de9b1781b36436c85d32d15adcdb";
  private static final byte[] DAMAGED = "SC_SYNTHETIC_FAULT_PROBE_ONLY_20261024".getBytes(java.nio.charset.StandardCharsets.UTF_8);
  private static final int MAX_BYTES = 2_000_000;
  private String token;
  private File root, control, target;
  private byte[] original;
  private boolean damaged;
  private int visited;

  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    token = args == null ? "" : args.getString("token", "");
    if (!token.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("A unique test session token is required");
    start();
  }

  @Override public void onStart() {
    long deadline = SystemClock.elapsedRealtime() + 900_000;
    long lastCommand = SystemClock.elapsedRealtime();
    int sequence = 0;
    Bundle finalResult = new Bundle();
    try {
      if (!getTargetContext().getPackageName().equals("app.showcontrol.working")) throw new SecurityException("Unexpected target");
      root = getTargetContext().getFilesDir().getCanonicalFile();
      File external = getTargetContext().getExternalFilesDir(null);
      if (external == null) throw new IOException("External test control storage unavailable");
      control = new File(external, "native-fault-probe-" + token);
      if (!control.mkdirs() && !control.isDirectory()) throw new IOException("Test control directory unavailable");
      try (InputStream stream = getContext().getAssets().open("synthetic-original.wav")) { original = boundedRead(stream); }
      if (!hash(original).equals(EXPECTED)) throw new SecurityException("Embedded fixture integrity mismatch");
      writeResult(0, "ready", true, null);
      getTargetContext().startActivity(new Intent().setClassName("app.showcontrol.working", "app.showcontrol.working.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      while (SystemClock.elapsedRealtime() < deadline && SystemClock.elapsedRealtime() - lastCommand < 300_000) {
        File command = new File(control, "command.json");
        JSONObject request = null;
        if (command.isFile() && command.length() <= 2048) {
          try (InputStream stream = new FileInputStream(command)) { request = new JSONObject(new String(boundedRead(stream), java.nio.charset.StandardCharsets.UTF_8)); }
          catch (Exception partialWrite) { /* Host publishes via a temporary file and rename; retry incomplete input. */ }
        }
        if (request != null && token.equals(request.optString("token")) && request.optInt("sequence", -1) == sequence + 1) {
          sequence++;
          lastCommand = SystemClock.elapsedRealtime();
          String action = request.optString("action");
          try {
            if (action.equals("finish")) { restore(); writeResult(sequence, action, true, null); break; }
            if (!Arrays.asList("locate", "corrupt", "restore").contains(action)) throw new SecurityException("Unknown test action");
            if (target == null) target = locate();
            if (action.equals("corrupt")) {
              requireCurrentHash(EXPECTED);
              // Set before writing so any failure still attempts exact restoration.
              damaged = true;
              replace(DAMAGED);
            } else if (action.equals("restore")) { restore(); }
            writeResult(sequence, action, true, null);
          } catch (Exception failure) {
            try { restore(); } catch (Exception restoreFailure) { failure.addSuppressed(restoreFailure); }
            writeResult(sequence, action, false, failure.getClass().getSimpleName() + ": " + failure.getMessage());
          }
        }
        SystemClock.sleep(100);
      }
      restore();
      finalResult.putString("result", "finished; fixture restored");
      finish(0, finalResult);
    } catch (Exception failure) {
      try { restore(); } catch (Exception restoreFailure) { failure.addSuppressed(restoreFailure); }
      finalResult.putString("error", failure.toString());
      finish(1, finalResult);
    }
  }

  private File locate() throws Exception {
    List<File> candidates = new ArrayList<>(); visited = 0; find(root, candidates, 0);
    if (candidates.size() != 1) throw new SecurityException("Expected one unique synthetic media file; found " + candidates.size());
    File candidate = candidates.get(0);
    String current = hash(readFile(candidate));
    if (!current.equals(EXPECTED) && !current.equals(hash(DAMAGED))) throw new SecurityException("Synthetic file has unexpected bytes; preserve it");
    target = candidate;
    // A previous process may have died mid-test. Repair only the exact known damaged bytes.
    if (current.equals(hash(DAMAGED))) { damaged = true; restore(); }
    return candidate;
  }

  private void find(File directory, List<File> candidates, int depth) throws Exception {
    if (depth > 8 || ++visited > 4096) throw new SecurityException("Bounded fixture scan exceeded");
    File[] entries = directory.listFiles(); if (entries == null) return;
    for (File entry : entries) {
      if (++visited > 4096) throw new SecurityException("Bounded fixture scan exceeded");
      File real = entry.getCanonicalFile();
      if (!real.getPath().startsWith(root.getPath() + File.separator)) throw new SecurityException("App storage escape");
      if (entry.isDirectory()) find(real, candidates, depth + 1);
      else if (entry.getName().matches("(?:media-)?" + EXPECTED + "\\.wav")) candidates.add(real);
    }
  }

  private synchronized void restore() throws Exception {
    if (!damaged || target == null || original == null) return;
    String current = hash(readFile(target));
    if (!current.equals(hash(DAMAGED)) && !current.equals(EXPECTED)) throw new SecurityException("Refuse to replace unexpected changed content");
    replace(original); requireCurrentHash(EXPECTED); damaged = false;
  }

  private void replace(byte[] bytes) throws Exception {
    if (target == null || !target.getCanonicalPath().startsWith(root.getPath() + File.separator)) throw new SecurityException("No guarded fixture");
    File temporary = new File(target.getParentFile(), ".sc-qa-" + token + ".tmp");
    if (temporary.exists()) throw new IOException("Preserve existing test temporary file");
    try {
      try (FileOutputStream stream = new FileOutputStream(temporary)) { stream.write(bytes); stream.getFD().sync(); }
      Os.rename(temporary.getAbsolutePath(), target.getAbsolutePath());
    } finally { if (temporary.exists() && !temporary.delete()) throw new IOException("Test temporary cleanup failed"); }
  }

  private void requireCurrentHash(String expected) throws Exception {
    if (!hash(readFile(target)).equals(expected)) throw new SecurityException("Fixture checksum changed; preserve it");
  }
  private byte[] readFile(File file) throws Exception { try (InputStream stream = new FileInputStream(file)) { return boundedRead(stream); } }
  private static byte[] boundedRead(InputStream stream) throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] block = new byte[16384]; int count;
    while ((count = stream.read(block)) != -1) { if (count > MAX_BYTES - bytes.size()) throw new IOException("Test input too large"); bytes.write(block, 0, count); }
    return bytes.toByteArray();
  }
  private static String hash(byte[] bytes) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder result = new StringBuilder();
    for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 255)); return result.toString();
  }
  private void writeResult(int sequence, String action, boolean ok, String error) throws Exception {
    JSONObject result = new JSONObject().put("sequence", sequence).put("action", action).put("success", ok).put("corruptActive", damaged).put("token", token);
    if (target != null) result.put("target", target.getAbsolutePath()).put("sha256", hash(readFile(target)));
    if (error != null) result.put("error", error);
    File temporary = new File(control, "result.tmp"), destination = new File(control, "result.json");
    try (FileOutputStream stream = new FileOutputStream(temporary)) { stream.write(result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); stream.getFD().sync(); }
    Os.rename(temporary.getAbsolutePath(), destination.getAbsolutePath());
  }
}
