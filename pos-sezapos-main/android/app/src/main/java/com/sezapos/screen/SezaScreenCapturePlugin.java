package com.sezapos.screen;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
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
 * Contract:
 *   - requestPermission(): opens system MediaProjection consent dialog.
 *     Resolves { granted:boolean, resultCode:int, dataIntent:string } where
 *     dataIntent is an opaque token kept inside the plugin (not exposed to JS).
 *   - start({ maxWidth?, maxFps?, bitrateKbps? }): starts foreground service +
 *     H.264 encoder, begins emitting `frame` events with base64 NALs.
 *   - stop(): tears everything down.
 *   - Events:
 *       "state"  -> { state: "starting"|"active"|"paused"|"stopped"|"permission_revoked" }
 *       "frame"  -> { data:string (base64), keyframe:boolean, ptsUs:number }
 *       "codec"  -> { mime:"video/avc", width:int, height:int, sps:string, pps:string }
 *       "error"  -> { message:string }
 *
 * The plugin never accepts input events back from JS. There is no touch,
 * keyboard, clipboard, camera, mic, or file surface exposed. Merchant remains
 * in full control via the persistent foreground-service notification and the
 * in-app banner.
 */
@CapacitorPlugin(name = "SezaScreenCapture")
public class SezaScreenCapturePlugin extends Plugin {

    private Integer pendingResultCode = null;
    private Intent pendingResultData = null;
    private boolean serviceBound = false;

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
        int maxWidth = call.getInt("maxWidth", 720);
        int maxFps = call.getInt("maxFps", 24);
        int bitrateKbps = call.getInt("bitrateKbps", 500);

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        Intent svc = new Intent(activity, ScreenCaptureService.class);
        svc.setAction(ScreenCaptureService.ACTION_START);
        svc.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, pendingResultCode);
        svc.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, pendingResultData);
        svc.putExtra(ScreenCaptureService.EXTRA_MAX_WIDTH, maxWidth);
        svc.putExtra(ScreenCaptureService.EXTRA_MAX_FPS, maxFps);
        svc.putExtra(ScreenCaptureService.EXTRA_BITRATE_KBPS, bitrateKbps);

        ScreenCaptureService.setPluginListener(new ScreenCaptureService.Listener() {
            @Override
            public void onState(String state) {
                JSObject o = new JSObject();
                o.put("state", state);
                notifyListeners("state", o);
                if ("stopped".equals(state) || "permission_revoked".equals(state)) {
                    // Consent is single-use; clear it so a new session must be
                    // approved again.
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
                JSObject o = new JSObject();
                o.put("message", message == null ? "unknown" : message);
                notifyListeners("error", o);
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(svc);
        } else {
            activity.startService(svc);
        }
        serviceBound = true;
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
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
        super.handleOnDestroy();
        ScreenCaptureService.setPluginListener(null);
    }
}
