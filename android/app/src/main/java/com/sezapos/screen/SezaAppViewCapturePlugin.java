package com.sezapos.screen;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;
import android.view.Window;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * SEZA POS app-window capture for support screen sharing.
 *
 * This intentionally captures only SEZA's own Activity window. It does not use
 * MediaProjection, does not record other apps/system UI, and does not depend on
 * a hardware H.264 encoder. The merchant still has to approve the support
 * request in the SEZA UI before this plugin is started.
 */
@CapacitorPlugin(name = "SezaAppViewCapture")
public class SezaAppViewCapturePlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private HandlerThread workerThread;
    private Handler workerHandler;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean captureInFlight = new AtomicBoolean(false);
    private volatile int generation = 0;
    private int maxWidth = 720;
    private int maxFps = 4;
    private int jpegQuality = 48;

    @PluginMethod
    public void start(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        maxWidth = clamp(call.getInt("maxWidth", 720), 320, 1280);
        maxFps = clamp(call.getInt("maxFps", 4), 1, 8);
        jpegQuality = clamp(call.getInt("jpegQuality", 48), 25, 75);

        ensureWorker();
        int currentGeneration = ++generation;
        running.set(true);
        captureInFlight.set(false);
        scheduleCapture(currentGeneration, 0);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    private void ensureWorker() {
        if (workerThread != null && workerThread.isAlive() && workerHandler != null) return;
        workerThread = new HandlerThread("SezaAppViewCapture");
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());
    }

    private void scheduleCapture(int expectedGeneration, long delayMs) {
        if (!running.get() || expectedGeneration != generation) return;
        mainHandler.postDelayed(() -> captureOnce(expectedGeneration), Math.max(0, delayMs));
    }

    private void captureOnce(int expectedGeneration) {
        if (!running.get() || expectedGeneration != generation) return;
        if (!captureInFlight.compareAndSet(false, true)) {
            scheduleCapture(expectedGeneration, frameDelayMs());
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            captureInFlight.set(false);
            emitError("SEZA window is not available");
            scheduleCapture(expectedGeneration, 750);
            return;
        }

        Window window = activity.getWindow();
        View decor = window != null ? window.getDecorView() : null;
        if (window == null || decor == null || decor.getWidth() <= 1 || decor.getHeight() <= 1) {
            captureInFlight.set(false);
            emitError("SEZA window has no visible frame");
            scheduleCapture(expectedGeneration, 500);
            return;
        }

        final int sourceWidth = decor.getWidth();
        final int sourceHeight = decor.getHeight();
        final Bitmap bitmap;
        try {
            bitmap = Bitmap.createBitmap(sourceWidth, sourceHeight, Bitmap.Config.ARGB_8888);
        } catch (Throwable t) {
            captureInFlight.set(false);
            emitError("Could not allocate screen frame: " + safeMessage(t));
            scheduleCapture(expectedGeneration, 1000);
            return;
        }

        try {
            PixelCopy.request(window, bitmap, result -> {
                if (!running.get() || expectedGeneration != generation) {
                    recycle(bitmap);
                    captureInFlight.set(false);
                    return;
                }

                if (result == PixelCopy.SUCCESS) {
                    // On this dual-display Android-x86 POS, PixelCopy can
                    // occasionally report SUCCESS while returning an all-black
                    // surface. Do not publish that frame: it is what makes the
                    // Admin viewer flash from a good picture back to black.
                    // Try the Activity view hierarchy immediately, then let the
                    // worker discard the frame if the fallback is still blank.
                    if (isMostlyBlack(bitmap)) {
                        try {
                            bitmap.eraseColor(Color.TRANSPARENT);
                            Canvas canvas = new Canvas(bitmap);
                            decor.draw(canvas);
                        } catch (Throwable ignored) {
                            // processBitmap performs a second blank-frame guard.
                        }
                    }
                    processBitmap(bitmap, expectedGeneration);
                    return;
                }

                // Some Android-x86/custom POS builds expose unusual physical
                // display topology. PixelCopy can fail there even though the
                // Activity is visible, so fall back to drawing SEZA's own view.
                try {
                    Canvas canvas = new Canvas(bitmap);
                    decor.draw(canvas);
                    processBitmap(bitmap, expectedGeneration);
                } catch (Throwable t) {
                    recycle(bitmap);
                    captureInFlight.set(false);
                    emitError("Could not copy SEZA screen: " + safeMessage(t));
                    scheduleCapture(expectedGeneration, 750);
                }
            }, mainHandler);
        } catch (Throwable t) {
            // Last-resort View.draw fallback when PixelCopy itself is not
            // implemented correctly by the device image.
            try {
                Canvas canvas = new Canvas(bitmap);
                decor.draw(canvas);
                processBitmap(bitmap, expectedGeneration);
            } catch (Throwable fallbackError) {
                recycle(bitmap);
                captureInFlight.set(false);
                emitError("Could not capture SEZA screen: " + safeMessage(fallbackError));
                scheduleCapture(expectedGeneration, 750);
            }
        }
    }

    private void processBitmap(Bitmap source, int expectedGeneration) {
        Handler worker = workerHandler;
        if (worker == null) {
            recycle(source);
            captureInFlight.set(false);
            scheduleCapture(expectedGeneration, 750);
            return;
        }

        worker.post(() -> {
            Bitmap output = source;
            try {
                if (!running.get() || expectedGeneration != generation) return;

                // Never replace a valid Admin frame with a bogus black frame.
                // A legitimate SEZA screen may use dark UI elements, but it is
                // not >96% near-black across a coarse full-screen sample.
                if (isMostlyBlack(source)) return;

                int outWidth = source.getWidth();
                int outHeight = source.getHeight();
                if (outWidth > maxWidth) {
                    outHeight = Math.max(2, Math.round((float) outHeight * maxWidth / outWidth));
                    outWidth = maxWidth;
                    output = Bitmap.createScaledBitmap(source, outWidth, outHeight, true);
                }

                byte[] jpeg = compressBounded(output, jpegQuality);
                if (jpeg == null || jpeg.length == 0) {
                    emitError("Could not encode SEZA screen frame");
                    return;
                }

                final String encoded = Base64.encodeToString(jpeg, Base64.NO_WRAP);
                final int finalWidth = output.getWidth();
                final int finalHeight = output.getHeight();
                final long capturedAt = System.currentTimeMillis();

                mainHandler.post(() -> {
                    if (!running.get() || expectedGeneration != generation) return;
                    JSObject payload = new JSObject();
                    payload.put("data", encoded);
                    payload.put("width", finalWidth);
                    payload.put("height", finalHeight);
                    payload.put("capturedAt", capturedAt);
                    notifyListeners("frame", payload);
                });
            } catch (Throwable t) {
                emitError("SEZA frame processing failed: " + safeMessage(t));
            } finally {
                if (output != source) recycle(output);
                recycle(source);
                captureInFlight.set(false);
                scheduleCapture(expectedGeneration, frameDelayMs());
            }
        });
    }

    /** Keep individual bridge payloads comfortably below common realtime/WebView limits. */
    private byte[] compressBounded(Bitmap bitmap, int initialQuality) {
        int[] qualities = new int[] { initialQuality, 40, 32, 26 };
        byte[] best = null;
        for (int quality : qualities) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) continue;
            best = out.toByteArray();
            if (best.length <= 180_000) break;
        }
        return best;
    }

    private long frameDelayMs() {
        return Math.max(125L, Math.round(1000.0 / Math.max(1, maxFps)));
    }

    private void emitError(String message) {
        mainHandler.post(() -> {
            if (!running.get()) return;
            JSObject payload = new JSObject();
            payload.put("message", message == null ? "Screen capture error" : message);
            notifyListeners("error", payload);
        });
    }

    private void stopInternal() {
        running.set(false);
        generation++;
        captureInFlight.set(false);
    }

    private static boolean isMostlyBlack(Bitmap bitmap) {
        if (bitmap == null || bitmap.isRecycled() || bitmap.getWidth() < 2 || bitmap.getHeight() < 2) {
            return true;
        }
        final int columns = 18;
        final int rows = 14;
        int sampled = 0;
        int nearBlack = 0;
        try {
            for (int row = 0; row < rows; row++) {
                int y = Math.min(bitmap.getHeight() - 1,
                    Math.max(0, Math.round((row + 0.5f) * bitmap.getHeight() / rows)));
                for (int col = 0; col < columns; col++) {
                    int x = Math.min(bitmap.getWidth() - 1,
                        Math.max(0, Math.round((col + 0.5f) * bitmap.getWidth() / columns)));
                    int pixel = bitmap.getPixel(x, y);
                    int r = Color.red(pixel);
                    int g = Color.green(pixel);
                    int b = Color.blue(pixel);
                    sampled++;
                    if (r <= 18 && g <= 18 && b <= 18) nearBlack++;
                }
            }
        } catch (Throwable ignored) {
            return false;
        }
        return sampled > 0 && ((double) nearBlack / (double) sampled) >= 0.96d;
    }

    private static int clamp(Integer value, int min, int max) {
        int v = value == null ? min : value;
        return Math.max(min, Math.min(max, v));
    }

    private static String safeMessage(Throwable t) {
        if (t == null || t.getMessage() == null || t.getMessage().trim().isEmpty()) {
            return t == null ? "unknown" : t.getClass().getSimpleName();
        }
        return t.getMessage();
    }

    private static void recycle(Bitmap bitmap) {
        if (bitmap == null) return;
        try {
            if (!bitmap.isRecycled()) bitmap.recycle();
        } catch (Throwable ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        if (workerThread != null) {
            try { workerThread.quitSafely(); } catch (Throwable ignored) {}
            workerThread = null;
            workerHandler = null;
        }
        super.handleOnDestroy();
    }
}
