package com.sezapos.screen;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.Surface;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.nio.ByteBuffer;

/**
 * Foreground service that owns the MediaProjection + VirtualDisplay + MediaCodec
 * encoder pipeline. Runs the encoder on a background handler thread and
 * forwards H.264 NALs to whichever plugin instance is currently attached.
 *
 * The service is idempotent: START while running is ignored; STOP tears
 * everything down. It also stops itself if the merchant revokes projection
 * (onStop callback) or if the encoder errors out.
 */
public class ScreenCaptureService extends Service {

    public static final String ACTION_START = "com.sezapos.screen.START";
    public static final String ACTION_STOP = "com.sezapos.screen.STOP";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String EXTRA_MAX_WIDTH = "maxWidth";
    public static final String EXTRA_MAX_FPS = "maxFps";
    public static final String EXTRA_BITRATE_KBPS = "bitrateKbps";

    private static final String CHANNEL_ID = "seza_support_screen_share";
    private static final int NOTIFICATION_ID = 8801;

    public interface Listener {
        void onState(String state);
        void onCodec(String mime, int width, int height, byte[] sps, byte[] pps);
        void onFrame(byte[] data, boolean keyframe, long ptsUs);
        void onError(String message);
    }

    private static volatile Listener sListener;

    public static void setPluginListener(@Nullable Listener l) {
        sListener = l;
    }

    private static void emitState(String s) {
        Listener l = sListener;
        if (l != null) try { l.onState(s); } catch (Throwable ignored) {}
    }
    private static void emitError(String m) {
        Listener l = sListener;
        if (l != null) try { l.onError(m); } catch (Throwable ignored) {}
    }
    private static void emitFrame(byte[] d, boolean k, long p) {
        Listener l = sListener;
        if (l != null) try { l.onFrame(d, k, p); } catch (Throwable ignored) {}
    }
    private static void emitCodec(String mime, int w, int h, byte[] sps, byte[] pps) {
        Listener l = sListener;
        if (l != null) try { l.onCodec(mime, w, h, sps, pps); } catch (Throwable ignored) {}
    }

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private MediaCodec encoder;
    private Surface inputSurface;
    private HandlerThread encoderThread;
    private Handler encoderHandler;
    private volatile boolean running = false;
    private final Object lock = new Object();

    private byte[] sps;
    private byte[] pps;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopEverything("stopped");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(action)) return START_NOT_STICKY;

        if (running) return START_NOT_STICKY;
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent data = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        int maxWidth = intent.getIntExtra(EXTRA_MAX_WIDTH, 720);
        int maxFps = intent.getIntExtra(EXTRA_MAX_FPS, 24);
        int bitrateKbps = intent.getIntExtra(EXTRA_BITRATE_KBPS, 500);

        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Throwable t) {
            emitError("Foreground service failed: " + t.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }

        emitState("starting");
        try {
            startCapture(resultCode, data, maxWidth, maxFps, bitrateKbps);
            running = true;
            emitState("active");
        } catch (Throwable t) {
            emitError("start failed: " + t.getMessage());
            stopEverything("stopped");
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void startCapture(int resultCode, Intent data, int maxWidth, int maxFps, int bitrateKbps)
            throws Exception {
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (mpm == null) throw new IllegalStateException("no MediaProjectionManager");
        projection = mpm.getMediaProjection(resultCode, data);
        if (projection == null) throw new IllegalStateException("null MediaProjection");

        // Register a callback BEFORE creating the virtual display (Android 14+ requirement).
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                emitState("permission_revoked");
                stopEverything("stopped");
                stopSelf();
            }
        }, new Handler(getMainLooper()));

        DisplayMetrics dm = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (wm != null && wm.getDefaultDisplay() != null) {
            wm.getDefaultDisplay().getRealMetrics(dm);
        } else {
            dm = getResources().getDisplayMetrics();
        }

        int srcW = dm.widthPixels;
        int srcH = dm.heightPixels;
        // Scale to maxWidth on the shorter dimension to preserve aspect.
        int targetW, targetH;
        if (srcW <= srcH) {
            targetW = Math.min(maxWidth, srcW);
            targetH = (int) Math.round((double) targetW * srcH / srcW);
        } else {
            targetH = Math.min(maxWidth, srcH);
            targetW = (int) Math.round((double) targetH * srcW / srcH);
        }
        // Round to even (H.264 requires even dimensions).
        targetW = (targetW / 2) * 2;
        targetH = (targetH / 2) * 2;
        if (targetW < 2 || targetH < 2) throw new IllegalStateException("bad target size");

        MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, targetW, targetH);
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        format.setInteger(MediaFormat.KEY_BIT_RATE, bitrateKbps * 1000);
        format.setInteger(MediaFormat.KEY_FRAME_RATE, maxFps);
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            format.setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Constrained baseline for maximum WebCodecs decoder compatibility.
            format.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);
            format.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel31);
        }

        encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        inputSurface = encoder.createInputSurface();

        encoderThread = new HandlerThread("SezaScreenEnc");
        encoderThread.start();
        encoderHandler = new Handler(encoderThread.getLooper());

        final int finalW = targetW;
        final int finalH = targetH;
        encoder.setCallback(new MediaCodec.Callback() {
            @Override
            public void onInputBufferAvailable(MediaCodec codec, int index) { /* surface input */ }

            @Override
            public void onOutputBufferAvailable(MediaCodec codec, int index, MediaCodec.BufferInfo info) {
                try {
                    ByteBuffer buf = codec.getOutputBuffer(index);
                    if (buf != null && info.size > 0) {
                        buf.position(info.offset);
                        buf.limit(info.offset + info.size);
                        byte[] out = new byte[info.size];
                        buf.get(out);
                        boolean isConfig = (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0;
                        boolean isKey = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0;
                        if (isConfig) {
                            // Extract SPS and PPS from the config NAL stream.
                            extractSpsPps(out);
                            emitCodec(MediaFormat.MIMETYPE_VIDEO_AVC, finalW, finalH, sps, pps);
                        } else {
                            emitFrame(out, isKey, info.presentationTimeUs);
                        }
                    }
                } catch (Throwable t) {
                    emitError("output failed: " + t.getMessage());
                } finally {
                    try { codec.releaseOutputBuffer(index, false); } catch (Throwable ignored) {}
                }
            }

            @Override
            public void onError(MediaCodec codec, MediaCodec.CodecException e) {
                emitError("codec error: " + e.getMessage());
                stopEverything("stopped");
                stopSelf();
            }

            @Override
            public void onOutputFormatChanged(MediaCodec codec, MediaFormat format) {
                ByteBuffer spsBuf = format.getByteBuffer("csd-0");
                ByteBuffer ppsBuf = format.getByteBuffer("csd-1");
                if (spsBuf != null) { sps = new byte[spsBuf.remaining()]; spsBuf.get(sps); }
                if (ppsBuf != null) { pps = new byte[ppsBuf.remaining()]; ppsBuf.get(pps); }
                emitCodec(MediaFormat.MIMETYPE_VIDEO_AVC, finalW, finalH, sps, pps);
            }
        }, encoderHandler);
        encoder.start();

        virtualDisplay = projection.createVirtualDisplay(
                "SezaScreenShare",
                targetW, targetH, dm.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                inputSurface,
                null, null);
    }

    /**
     * Best-effort split of the codec-config NAL blob into SPS + PPS chunks,
     * without depending on Android internals. Prefers `csd-0` / `csd-1` from
     * onOutputFormatChanged when those are present.
     */
    private void extractSpsPps(byte[] blob) {
        int i = 0;
        int last = -1;
        int lastType = -1;
        int len = blob.length;
        while (i + 4 <= len) {
            boolean start3 = blob[i] == 0 && blob[i + 1] == 0 && blob[i + 2] == 1;
            boolean start4 = i + 4 <= len && blob[i] == 0 && blob[i + 1] == 0 && blob[i + 2] == 0 && blob[i + 3] == 1;
            if (start3 || start4) {
                int headerLen = start4 ? 4 : 3;
                int nalStart = i + headerLen;
                if (nalStart >= len) break;
                int nalType = blob[nalStart] & 0x1F;
                if (last >= 0) {
                    byte[] chunk = new byte[i - last];
                    System.arraycopy(blob, last, chunk, 0, chunk.length);
                    if (lastType == 7 && sps == null) sps = chunk;
                    else if (lastType == 8 && pps == null) pps = chunk;
                }
                last = i;
                lastType = nalType;
                i += headerLen;
            } else {
                i++;
            }
        }
        if (last >= 0) {
            byte[] chunk = new byte[len - last];
            System.arraycopy(blob, last, chunk, 0, chunk.length);
            if (lastType == 7 && sps == null) sps = chunk;
            else if (lastType == 8 && pps == null) pps = chunk;
        }
    }

    private void stopEverything(String state) {
        synchronized (lock) {
            running = false;
            try { if (encoder != null) { encoder.stop(); } } catch (Throwable ignored) {}
            try { if (encoder != null) { encoder.release(); } } catch (Throwable ignored) {}
            encoder = null;
            try { if (inputSurface != null) inputSurface.release(); } catch (Throwable ignored) {}
            inputSurface = null;
            try { if (virtualDisplay != null) virtualDisplay.release(); } catch (Throwable ignored) {}
            virtualDisplay = null;
            try { if (projection != null) projection.stop(); } catch (Throwable ignored) {}
            projection = null;
            if (encoderThread != null) {
                try { encoderThread.quitSafely(); } catch (Throwable ignored) {}
                encoderThread = null;
                encoderHandler = null;
            }
            sps = null;
            pps = null;
        }
        emitState(state);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        stopEverything("stopped");
        super.onDestroy();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "Support screen sharing",
                        NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Shown while SEZA Support is viewing your screen.");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private Notification buildNotification() {
        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent stopPi = PendingIntent.getService(this, 0, stopIntent, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setContentTitle("SEZA Support is viewing your screen")
                .setContentText("Tap Stop to end the session immediately.")
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop sharing", stopPi);
        return b.build();
    }
}
