package app.showcontrol.visualimageprobe;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.Presentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.BitmapDrawable;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.*;
import java.lang.reflect.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Separate same-signer QA only. No library scans, audio commands, network or app fault endpoint. */
public final class VisualImageProbe extends Instrumentation {
  private Bundle arguments;
  private Activity activity;
  private Presentation presentation;
  private VirtualDisplay display;
  private ImageReader reader;
  private HandlerThread drain;
  private File directory, large, small, damaged;
  private boolean ownedDirectoryCreated = false;
  private Method showAsset, blackout, testPattern;
  private ImageView image;
  private TextView pattern;
  private ExecutorService worker;
  private final AtomicInteger faults = new AtomicInteger();
  private final List<String> passed = new ArrayList<>();
  private final List<CountDownLatch> blockers = new ArrayList<>();

  @Override public void onCreate(Bundle args) { arguments = args; start(); }
  private static void require(boolean okay, String message) { if (!okay) throw new IllegalStateException(message); }
  private static String digest(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream stream = new FileInputStream(file)) {
      byte[] bytes = new byte[65536]; int read;
      while ((read = stream.read(bytes)) != -1) digest.update(bytes, 0, read);
    }
    StringBuilder value = new StringBuilder(); for (byte b : digest.digest()) value.append(String.format(Locale.ROOT, "%02X", b));
    return value.toString();
  }
  private void main(Callable<Void> task) {
    final Throwable[] failure = new Throwable[1];
    runOnMainSync(() -> { try { task.call(); } catch (Throwable error) { failure[0] = error; } });
    if (failure[0] != null) throw new IllegalStateException("UI assertion failed", failure[0]);
  }
  private void show(File file) throws Exception { showAsset.invoke(presentation, file, false, 1f); }
  private int bitmapColor() {
    final int[] value = {0};
    main(() -> {
      if (image.getDrawable() instanceof BitmapDrawable) value[0] = ((BitmapDrawable)image.getDrawable()).getBitmap().getPixel(0, 0);
      return null;
    }); return value[0];
  }
  private void waitColor(int color) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
    while (System.nanoTime() < deadline) { if (bitmapColor() == color) return; Thread.sleep(25); }
    throw new IllegalStateException("Expected decoded color was not observed");
  }
  private CountDownLatch holdWorker() throws Exception {
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1); blockers.add(release);
    worker.execute(() -> { entered.countDown(); try { release.await(10, TimeUnit.SECONDS); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } });
    require(entered.await(5, TimeUnit.SECONDS), "Worker hold was not entered");
    return release;
  }
  private void settle() throws Exception {
    worker.submit(() -> {}).get(5, TimeUnit.SECONDS);
    main(() -> null); waitForIdleSync();
  }
  private void blank() { main(() -> { require(image.getDrawable() == null, "A stale image became visible"); return null; }); }

  @Override public void onStart() {
    Bundle result = new Bundle(); int exit = 1; String failure = null;
    try {
      String token = arguments.getString("token", "");
      require(token.matches("[a-f0-9-]{36}"), "Fresh UUID token required");
      Context context = getTargetContext();
      require(context.getPackageName().equals("app.showcontrol.working"), "Wrong target");
      String expected = arguments.getString("expectedApkSha256", "");
      require(expected.matches("[A-F0-9]{64}") && digest(new File(context.getApplicationInfo().sourceDir)).equals(expected), "Unexpected target APK");
      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      require(launch != null, "Launch activity unavailable"); launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity = startActivitySync(launch); waitForIdleSync();
      directory = new File(context.getCacheDir(), "visual-image-qa-" + token).getCanonicalFile();
      require(directory.getParentFile().equals(context.getCacheDir().getCanonicalFile()) && !directory.exists() && directory.mkdir(), "Owned cache directory unavailable");
      ownedDirectoryCreated = true;
      large = new File(directory, "large.png"); small = new File(directory, "small.png"); damaged = new File(directory, "damaged.png");
      try (InputStream source = getContext().getAssets().open("large.png"); OutputStream dest = new FileOutputStream(large)) {
        byte[] bytes = new byte[65536]; int read, total = 0;
        while ((read = source.read(bytes)) != -1) { total += read; require(total <= 2000000, "Fixture too large"); dest.write(bytes, 0, read); }
      }
      require(digest(large).equals(arguments.getString("fixtureSha256")), "Fixture checksum differs");
      Bitmap tiny = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888); tiny.eraseColor(Color.GREEN);
      try (OutputStream dest = new FileOutputStream(small)) { require(tiny.compress(Bitmap.CompressFormat.PNG, 100, dest), "Small fixture failed"); } finally { tiny.recycle(); }
      try (OutputStream dest = new FileOutputStream(damaged)) { dest.write(new byte[] { 1, 2, 3, 4 }); }
      drain = new HandlerThread("visual-qa-surface-drain"); drain.start();
      reader = ImageReader.newInstance(640, 360, PixelFormat.RGBA_8888, 3);
      reader.setOnImageAvailableListener(source -> { try (Image frame = source.acquireLatestImage()) {} }, new Handler(drain.getLooper()));
      DisplayManager manager = (DisplayManager)context.getSystemService(Context.DISPLAY_SERVICE);
      display = manager.createVirtualDisplay("Show Control isolated visual QA", 640, 360, 160, reader.getSurface(), DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION | DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY);
      require(display != null, "Virtual presentation display unavailable");
      ClassLoader loader = context.getClassLoader();
      Class<?> type = Class.forName("app.showcontrol.visual.AudiencePresentation", true, loader);
      Class<?> function = Class.forName("kotlin.jvm.functions.Function0", true, loader);
      Object unit = Class.forName("kotlin.Unit", true, loader).getField("INSTANCE").get(null);
      Object callback = Proxy.newProxyInstance(loader, new Class<?>[] { function }, (proxy, method, args) -> {
        if (method.getName().equals("invoke")) { faults.incrementAndGet(); return unit; }
        if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
        if (method.getName().equals("equals")) return proxy == args[0];
        return "Visual QA callback";
      });
      Constructor<?> constructor = type.getDeclaredConstructor(Context.class, android.view.Display.class, function); constructor.setAccessible(true);
      showAsset = type.getDeclaredMethod("showAsset", File.class, boolean.class, float.class); showAsset.setAccessible(true);
      blackout = type.getDeclaredMethod("blackout"); blackout.setAccessible(true);
      testPattern = type.getDeclaredMethod("testPattern", String.class, String.class); testPattern.setAccessible(true);
      main(() -> {
        presentation = (Presentation)constructor.newInstance(activity, display.getDisplay(), callback);
        presentation.show(); blackout.invoke(presentation);
        Field imageField = type.getDeclaredField("image"); imageField.setAccessible(true); image = (ImageView)imageField.get(presentation);
        Field patternField = type.getDeclaredField("pattern"); patternField.setAccessible(true); pattern = (TextView)patternField.get(presentation);
        Field workerField = type.getDeclaredField("imageWorker"); workerField.setAccessible(true); worker = (ExecutorService)workerField.get(presentation);
        return null;
      });
      main(() -> { show(large); return null; }); waitColor(Color.rgb(51, 102, 153));
      main(() -> { Bitmap value = ((BitmapDrawable)image.getDrawable()).getBitmap(); require(value.getWidth() == 1500 && value.getHeight() == 1000, "Downsampling differs"); return null; });
      passed.add("24MP image decodes to 1500x1000 through the production renderer");

      CountDownLatch blacked = holdWorker();
      main(() -> { show(large); blackout.invoke(presentation); return null; });
      blank(); blacked.countDown(); settle(); blank(); require(faults.get() == 0, "Blackout reported a stale fault");
      passed.add("blackout remains blank after queued image work settles");

      CountDownLatch patterned = holdWorker();
      main(() -> { show(large); testPattern.invoke(presentation, "VISUAL QA", "Silent virtual display"); require(pattern.getVisibility() == View.VISIBLE, "UI pattern did not respond"); return null; });
      patterned.countDown(); settle(); blank();
      main(() -> { require(pattern.getVisibility() == View.VISIBLE, "Late image replaced test pattern"); return null; });
      passed.add("main-thread pattern remains responsive and owns output while image worker is held");

      CountDownLatch replaced = holdWorker();
      main(() -> { for (int i = 0; i < 50; i++) show(large); show(small); return null; });
      replaced.countDown(); waitColor(Color.GREEN); require(faults.get() == 0, "Replacement fault");
      passed.add("fifty rapid replacements publish only the final green image");

      main(() -> { show(damaged); return null; });
      long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
      while (faults.get() == 0 && System.nanoTime() < deadline) Thread.sleep(25);
      require(faults.get() == 1, "Damaged image must report exactly one current fault"); blank();
      main(() -> { show(large); return null; }); waitColor(Color.rgb(51, 102, 153)); require(faults.get() == 1, "Retry fault");
      passed.add("damaged-image failure blackouts and a deliberate valid retry succeeds");

      CountDownLatch dismissed = holdWorker();
      main(() -> { show(large); presentation.dismiss(); return null; }); dismissed.countDown();
      require(worker.awaitTermination(5, TimeUnit.SECONDS), "Renderer worker did not terminate");
      main(() -> { require(!presentation.isShowing(), "Dismissed output reopened"); return null; });
      blank(); require(faults.get() == 1, "Dismissal produced a stale error");
      passed.add("dismissal closes image ownership and its executor without reopening output");
      exit = 0;
    } catch (Throwable error) {
      StringWriter text = new StringWriter(); error.printStackTrace(new PrintWriter(text)); failure = text.toString();
    } finally {
      for (CountDownLatch blocker : blockers) blocker.countDown();
      try { if (presentation != null) main(() -> { presentation.dismiss(); return null; }); } catch (Throwable ignored) {}
      try { if (display != null) display.release(); } catch (Throwable ignored) {}
      try { if (reader != null) reader.close(); } catch (Throwable ignored) {}
      if (drain != null) drain.quitSafely();
      boolean cleaned = true;
      if (ownedDirectoryCreated) {
        for (File file : new File[] { large, small, damaged }) if (file != null && file.exists()) cleaned &= file.delete();
        if (directory != null && directory.exists()) cleaned &= directory.delete();
      }
      if (!cleaned) { exit = 1; failure = String.valueOf(failure) + "\nOwned fixture cleanup incomplete"; }
      result.putString("cases", String.join("\n", passed)); result.putInt("casesPassed", passed.size()); result.putInt("faults", faults.get());
      result.putBoolean("ownedFilesRemoved", cleaned); result.putBoolean("virtualDisplayOnly", true);
      if (failure != null) result.putString("failure", failure);
      finish(exit == 0 ? Activity.RESULT_OK : Activity.RESULT_CANCELED, result);
    }
  }
}
