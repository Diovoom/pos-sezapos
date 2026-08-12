package com.sezapos.device;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SezaDeviceControl")
public class SezaDeviceControlPlugin extends Plugin {
    public static final String PREFS = "seza_device_control";
    public static final String BOOT = "launch_on_boot";
    public static final String AWAKE = "keep_awake";
    public static final String IMMERSIVE = "immersive";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void applyWindowPreferences(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(AWAKE, true)) {
            activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        if (prefs.getBoolean(IMMERSIVE, false)) {
            applyImmersive(activity);
        } else {
            activity.getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @SuppressWarnings("deprecation")
    public static void applyImmersive(Activity activity) {
        activity.getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("launchOnBoot", prefs().getBoolean(BOOT, false));
        result.put("keepAwake", prefs().getBoolean(AWAKE, true));
        result.put("immersive", prefs().getBoolean(IMMERSIVE, false));
        result.put("inLockTask", getActivity() != null && getActivity().isInMultiWindowMode() == false && isLockTaskActive());
        result.put("deviceOwner", isDeviceOwner());
        call.resolve(result);
    }

    @PluginMethod
    public void setLaunchOnBoot(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        prefs().edit().putBoolean(BOOT, enabled).apply();
        call.resolve();
    }

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        prefs().edit().putBoolean(AWAKE, enabled).apply();
        getActivity().runOnUiThread(() -> applyWindowPreferences(getActivity()));
        call.resolve();
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        prefs().edit().putBoolean(IMMERSIVE, enabled).apply();
        getActivity().runOnUiThread(() -> {
            if (enabled) applyImmersive(getActivity());
            else getActivity().getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        });
        call.resolve();
    }

    @PluginMethod
    public void startKiosk(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> {
                applyImmersive(getActivity());
                getActivity().startLockTask();
            });
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to start kiosk mode", e);
        }
    }

    @PluginMethod
    public void stopKiosk(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> getActivity().stopLockTask());
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to stop kiosk mode", e);
        }
    }

    @PluginMethod
    public void relaunch(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            android.content.Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
            if (intent != null) {
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
        });
    }

    @PluginMethod
    public void exitToLauncher(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            try { getActivity().stopLockTask(); } catch (Exception ignored) {}
            android.content.Intent home = new android.content.Intent(android.content.Intent.ACTION_MAIN);
            home.addCategory(android.content.Intent.CATEGORY_HOME);
            home.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(home);
        });
    }

    private boolean isDeviceOwner() {
        DevicePolicyManager dpm = (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isDeviceOwnerApp(getContext().getPackageName());
    }

    private boolean isLockTaskActive() {
        android.app.ActivityManager am = (android.app.ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return am.getLockTaskModeState() != android.app.ActivityManager.LOCK_TASK_MODE_NONE;
        }
        return false;
    }
}
