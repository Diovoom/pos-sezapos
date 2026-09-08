package com.sezapos.screen;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * SEZA POS — Android screen-capture plugin.
 *
 * VIEW-ONLY live screen sharing for SEZA Support.
 *
 * start() deliberately does not resolve until the foreground MediaProjection
 * service reports ACTIVE. Older builds resolved immediately after launching
 * the service, which made JavaScript believe sharing had started even when the
 * device encoder failed a moment later.
 */
@CapacitorPlugin(name = "SezaScreenCapture")
public class SezaScreenCapturePlugin extends Plugin {

    private Integer pendingResultCode = null;
    private Intent pendingResultData = null;
    private boolean serviceBound = false;
    private PluginCall pendingStartCall = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable startTimeout = null;

    private void clearStartTimeout() {
        if (startTimeout != null) {
            mainHandler.removeCallbacks(startTimeout);
            startTimeout = null;
        }
    }

    private void resolveStartIfWaiting() {
        PluginCall call = pendingStartCall;
        pendingStartCall = null;
        clearStartTimeout();
        if (call != null) call.resolve();
    }

    private void rejectStartIfWaiting(String message) {
        PluginCall call = pendingStartCall;
        pendingStartCall = null;
        clearStartTimeout();
        if (call != null) call.reject(message == null ? "Screen capture failed to start" : message);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            call.reject("MediaProjection requires Android 5.0+");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        MediaProjectionManager mpm = (MediaProjectionManager)
                activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm == null) {
            call.reject("MediaProjectionManager unavailable");
            return;
        }
        Intent consent = mpm.createScreenCaptureIntent();
        startActivityForResult(call, consent, "onProjectionResult");
    }

    @ActivityCallback
    private void onProjectionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        int rc = result.getResultCode();
        Intent data = result.getData();
        boolean granted = rc == Activity.RESULT_OK && data != null;
        if (granted) {
            pendingResultCode = rc;
            pendingResultData = data;
        } else {
            pendingResultCode = null;
            pendingResultData = null;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (pendingResultCode == null || pendingResultData == null) {
            call.reject("Permission not granted");
            return;
        }
        if (pendingStartCall != null) {
            call.reject("Screen capture is already starting");
            return;
        }

        int maxWidth = call.getInt("maxWidth", 720);
        int maxFps = call.getInt("maxFps", 15);
        int bitrateKbps = call.getInt("bitrateKbps", 700);

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        pendingStartCall = call;
        startTimeout = () -> {
            if (pendingStartCall != null) {
                rejectStartIfWaiting("Screen capture service did not become active");
                try {
                    Intent stop = new Intent(activity, ScreenCaptureService.class);
                    stop.setAction(ScreenCaptureService.ACTION_STOP);
                    activity.startService(stop);
                } catch (Throwable ignored) {}
            }
        };
        mainHandler.postDelayed(startTimeout, 12_000);

        ScreenCaptureService.setPluginListener(new ScreenCaptureService.Listener() {
            @Override
            public void onState(String state) {
                JSObject o = new JSObject();
                o.put("state", state);
                notifyListeners("state", o);

                if ("active".equals(state)) {
                    serviceBound = true;
                    resolveStartIfWaiting();
                } else if ("stopped".equals(state) || "permission_revoked".equals(state)) {
                    if (pendingStartCall != null) {
                        rejectStartIfWaiting(
                                "permission_revoked".equals(state)
                                        ? "Screen sharing permission was revoked"
                                        : "Screen capture stopped before it became active");
                    }
                    pendingResultCode = null;
                    pendingResultData = null;
                    serviceBound = false;
                }
            }

            @Override
            public void onCodec(String mime, int width, int height, byte[] sps, byte[] pps) {
                JSObject o = new JSObject();
                o.put("mime", mime);
                o.put("width", width);
                o.put("height", height);
                if (sps != null) o.put("sps", Base64.encodeToString(sps, Base64.NO_WRAP));
                if (pps != null) o.put("pps", Base64.encodeToString(pps, Base64.NO_WRAP));
                notifyListeners("codec", o);
            }

            @Override
            public void onFrame(byte[] data, boolean keyframe, long ptsUs) {
                JSObject o = new JSObject();
                o.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
                o.put("keyframe", keyframe);
                o.put("ptsUs", ptsUs);
                notifyListeners("frame", o);
            }

            @Override
            public void onError(String message) {
                String safe = message == null ? "unknown" : message;
                JSObject o = new JSObject();
                o.put("message", safe);
                notifyListeners("error", o);
                if (pendingStartCall != null) rejectStartIfWaiting(safe);
            }
        });

        Intent svc = new Intent(activity, ScreenCaptureService.class);
        svc.setAction(ScreenCaptureService.ACTION_START);
        svc.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, pendingResultCode);
        svc.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, pendingResultData);
        svc.putExtra(ScreenCaptureService.EXTRA_MAX_WIDTH, maxWidth);
        svc.putExtra(ScreenCaptureService.EXTRA_MAX_FPS, maxFps);
        svc.putExtra(ScreenCaptureService.EXTRA_BITRATE_KBPS, bitrateKbps);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(svc);
            } else {
                activity.startService(svc);
            }
        } catch (Throwable t) {
            rejectStartIfWaiting("Could not start screen capture service: " + t.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        rejectStartIfWaiting("Screen capture was stopped");
        Activity activity = getActivity();
        if (activity != null && serviceBound) {
            Intent svc = new Intent(activity, ScreenCaptureService.class);
            svc.setAction(ScreenCaptureService.ACTION_STOP);
            try { activity.startService(svc); } catch (Exception ignored) {}
        }
        serviceBound = false;
        pendingResultCode = null;
        pendingResultData = null;
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        rejectStartIfWaiting("Screen capture plugin was destroyed");
        ScreenCaptureService.setPluginListener(null);
        super.handleOnDestroy();
    }
}
