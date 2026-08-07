package com.sezapos.device;

import android.app.Activity;
import android.app.ActivityOptions;
import android.content.Context;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native dual-display controller.
 *
 * The customer screen runs as its own Activity on the physical secondary
 * display. Keeping it out of the cashier Activity avoids Presentation-window
 * focus/input bugs seen on some dual-screen POS firmware where enabling a
 * Presentation makes the primary touch controller stop driving Android UI.
 */
@CapacitorPlugin(name = "SezaCustomerDisplay")
public class SezaCustomerDisplayPlugin extends Plugin implements DisplayManager.DisplayListener {
    public static final String PREFS = "seza_customer_display";
    public static final String PREF_ENABLED = "enabled";
    public static final String PREF_DISPLAY_ID = "display_id";
    public static final String PREF_STORE_NAME = "store_name";
    public static final String PREF_PAYLOAD = "payload";

    private DisplayManager displayManager;
    private int activeDisplayId = -1;
    private String storeName = "SEZA POS";
    private String lastPayload = "{}";

    @Override
    public void load() {
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        displayManager.registerDisplayListener(this, null);
        new Handler(Looper.getMainLooper()).postDelayed(this::restoreSavedDisplay, 350);
    }

    @PluginMethod
    public void listDisplays(PluginCall call) {
        JSArray rows = new JSArray();
        int primary = primaryDisplayId();
        for (Display display : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (display.getDisplayId() == primary) continue;
            JSObject row = new JSObject();
            row.put("displayId", display.getDisplayId());
            row.put("name", display.getName());
            row.put("state", display.getState());
            row.put("valid", display.isValid());
            row.put("active", isEnabled() && activeDisplayId == display.getDisplayId());
            rows.put(row);
        }
        JSObject result = new JSObject();
        result.put("displays", rows);
        result.put("activeDisplayId", activeDisplayId);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        int requestedId = call.getInt("displayId", -1);
        storeName = call.getString("storeName", "SEZA POS");
        Display chosen = findSecondary(requestedId);
        if (chosen == null) {
            call.reject("No secondary customer display was detected");
            return;
        }

        activeDisplayId = chosen.getDisplayId();
        lastPayload = idlePayload(storeName);
        saveState(true, activeDisplayId, storeName, lastPayload);

        final int displayId = activeDisplayId;
        getActivity().runOnUiThread(() -> {
            try {
                launchDisplayActivity(displayId);
                // Explicitly put focus back on the cashier task/display after the
                // secondary Activity is launched. This is important on POS ROMs
                // that otherwise make the newly-created display task globally active.
                new Handler(Looper.getMainLooper()).postDelayed(this::refocusCashierActivity, 120);
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("displayId", displayId);
                call.resolve(result);
            } catch (Exception e) {
                saveState(false, -1, storeName, lastPayload);
                activeDisplayId = -1;
                call.reject("Could not start customer display: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        lastPayload = call.getString("payload", "{}");
        displayPrefs().edit().putString(PREF_PAYLOAD, lastPayload).apply();
        Intent update = new Intent(SezaCustomerDisplayActivity.ACTION_UPDATE);
        update.setPackage(getContext().getPackageName());
        getContext().sendBroadcast(update);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        saveState(false, -1, storeName, lastPayload);
        activeDisplayId = -1;
        Intent stop = new Intent(SezaCustomerDisplayActivity.ACTION_STOP);
        stop.setPackage(getContext().getPackageName());
        getContext().sendBroadcast(stop);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (activeDisplayId < 0) {
            activeDisplayId = displayPrefs().getInt(PREF_DISPLAY_ID, -1);
        }
        boolean running = isEnabled() && findSecondary(activeDisplayId) != null;
        JSObject result = new JSObject();
        result.put("running", running);
        result.put("displayId", running ? activeDisplayId : -1);
        call.resolve(result);
    }

    private android.content.SharedPreferences displayPrefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean isEnabled() {
        return displayPrefs().getBoolean(PREF_ENABLED, false);
    }

    private void saveState(boolean enabled, int displayId, String name, String payload) {
        displayPrefs().edit()
            .putBoolean(PREF_ENABLED, enabled)
            .putInt(PREF_DISPLAY_ID, displayId)
            .putString(PREF_STORE_NAME, name == null ? "SEZA POS" : name)
            .putString(PREF_PAYLOAD, payload == null ? "{}" : payload)
            .apply();
    }

    private void restoreSavedDisplay() {
        if (getActivity() == null || displayManager == null || !isEnabled()) return;
        int savedId = displayPrefs().getInt(PREF_DISPLAY_ID, -1);
        storeName = displayPrefs().getString(PREF_STORE_NAME, "SEZA POS");
        lastPayload = displayPrefs().getString(PREF_PAYLOAD, idlePayload(storeName));
        Display chosen = findSecondary(savedId);
        if (chosen == null) chosen = findSecondary(-1);
        if (chosen == null) return;
        activeDisplayId = chosen.getDisplayId();
        saveState(true, activeDisplayId, storeName, lastPayload);
        final int displayId = activeDisplayId;
        getActivity().runOnUiThread(() -> {
            launchDisplayActivity(displayId);
            new Handler(Looper.getMainLooper()).postDelayed(this::refocusCashierActivity, 120);
        });
    }

    private void launchDisplayActivity(int displayId) {
        Activity activity = getActivity();
        if (activity == null) return;
        Intent intent = new Intent(activity, SezaCustomerDisplayActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        ActivityOptions options = ActivityOptions.makeBasic();
        options.setLaunchDisplayId(displayId);
        activity.startActivity(intent, options.toBundle());
    }

    private void refocusCashierActivity() {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) return;
        try {
            Intent intent = new Intent(activity, activity.getClass());
            intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ActivityOptions options = ActivityOptions.makeBasic();
            options.setLaunchDisplayId(primaryDisplayId());
            activity.startActivity(intent, options.toBundle());
        } catch (Exception ignored) {
            if (activity.getWindow() != null) {
                activity.getWindow().getDecorView().setFocusableInTouchMode(true);
                activity.getWindow().getDecorView().requestFocus();
            }
        }
    }

    private int primaryDisplayId() {
        return getActivity() != null && getActivity().getDisplay() != null
            ? getActivity().getDisplay().getDisplayId()
            : Display.DEFAULT_DISPLAY;
    }

    private Display findSecondary(int requestedId) {
        if (displayManager == null) return null;
        for (Display display : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (display.getDisplayId() == primaryDisplayId()) continue;
            if (!display.isValid()) continue;
            if (requestedId >= 0 && display.getDisplayId() != requestedId) continue;
            return display;
        }
        return null;
    }

    private String idlePayload(String name) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", "seza-pos-display");
            payload.put("version", 2);
            payload.put("storeName", name == null || name.trim().isEmpty() ? "SEZA POS" : name);
            payload.put("currency", "USD");
            payload.put("phase", "idle");
            payload.put("lines", new JSONArray());
            payload.put("subtotal", 0);
            payload.put("discount", 0);
            payload.put("tax", 0);
            payload.put("total", 0);
            return payload.toString();
        } catch (Exception ignored) {
            return "{}";
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Do not relaunch on every route/dialog resume; only restore when the
        // secondary Activity actually disappeared.
        if (isEnabled() && !SezaCustomerDisplayActivity.isRunning()) {
            new Handler(Looper.getMainLooper()).postDelayed(this::restoreSavedDisplay, 180);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        super.handleOnDestroy();
    }

    @Override
    public void onDisplayAdded(int id) {
        new Handler(Looper.getMainLooper()).postDelayed(this::restoreSavedDisplay, 250);
    }

    @Override
    public void onDisplayChanged(int id) {
        if (id != activeDisplayId || !isEnabled()) return;
        Intent update = new Intent(SezaCustomerDisplayActivity.ACTION_UPDATE);
        update.setPackage(getContext().getPackageName());
        getContext().sendBroadcast(update);
    }

    @Override
    public void onDisplayRemoved(int id) {
        if (id == activeDisplayId) {
            activeDisplayId = -1;
            Intent stop = new Intent(SezaCustomerDisplayActivity.ACTION_STOP);
            stop.setPackage(getContext().getPackageName());
            getContext().sendBroadcast(stop);
        }
    }
}
