package com.sezapos.device;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.app.admin.DevicePolicyManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.net.wifi.WifiManager;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;

import java.util.Locale;
import java.util.Map;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "SezaDeviceControl",
    permissions = {
        @Permission(alias = "terminalLocation", strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "terminalBluetooth", strings = {
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_CONNECT
        })
    }
)
public class SezaDeviceControlPlugin extends Plugin {
    public static final String PREFS = "seza_device_control";
    public static final String BOOT = "launch_on_boot";
    public static final String AWAKE = "keep_awake";
    public static final String IMMERSIVE = "immersive";
    public static final String BRIGHTNESS = "brightness";

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
        float brightness = prefs.getFloat(BRIGHTNESS, 0.85f);
        WindowManager.LayoutParams layoutParams = activity.getWindow().getAttributes();
        layoutParams.screenBrightness = Math.max(0.2f, Math.min(1.0f, brightness));
        activity.getWindow().setAttributes(layoutParams);

        if (prefs.getBoolean(IMMERSIVE, true)) applyImmersive(activity);
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
        result.put("immersive", prefs().getBoolean(IMMERSIVE, true));
        result.put("inLockTask", getActivity() != null && getActivity().isInMultiWindowMode() == false && isLockTaskActive());
        result.put("deviceOwner", isDeviceOwner());
        result.put("brightness", prefs().getFloat(BRIGHTNESS, 0.85f));
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
    public void setBrightness(PluginCall call) {
        Double requested = call.getDouble("value", 0.85);
        float value = requested == null ? 0.85f : requested.floatValue();
        value = Math.max(0.2f, Math.min(1.0f, value));
        prefs().edit().putFloat(BRIGHTNESS, value).apply();
        final float brightness = value;
        getActivity().runOnUiThread(() -> {
            WindowManager.LayoutParams layoutParams = getActivity().getWindow().getAttributes();
            layoutParams.screenBrightness = brightness;
            getActivity().getWindow().setAttributes(layoutParams);
        });
        call.resolve();
    }

    @PluginMethod
    public void openDisplaySettings(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(Settings.ACTION_DISPLAY_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open Android display settings", e);
        }
    }


    @PluginMethod
    public void requestTerminalPermissions(PluginCall call) {
        String method = call.getString("method", "usb");
        boolean needsBluetooth = "bluetooth".equalsIgnoreCase(method) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        boolean locationGranted = getPermissionState("terminalLocation") == PermissionState.GRANTED;
        boolean bluetoothGranted = !needsBluetooth || getPermissionState("terminalBluetooth") == PermissionState.GRANTED;

        if (locationGranted && bluetoothGranted) {
            resolveTerminalPermissions(call, method);
            return;
        }

        if (needsBluetooth) {
            requestPermissionForAliases(
                new String[] { "terminalLocation", "terminalBluetooth" },
                call,
                "terminalPermissionsCallback"
            );
        } else {
            requestPermissionForAlias("terminalLocation", call, "terminalPermissionsCallback");
        }
    }

    @PermissionCallback
    private void terminalPermissionsCallback(PluginCall call) {
        resolveTerminalPermissions(call, call.getString("method", "usb"));
    }

    private void resolveTerminalPermissions(PluginCall call, String method) {
        boolean needsBluetooth = "bluetooth".equalsIgnoreCase(method) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        boolean locationGranted = getPermissionState("terminalLocation") == PermissionState.GRANTED;
        boolean bluetoothGranted = !needsBluetooth || getPermissionState("terminalBluetooth") == PermissionState.GRANTED;

        if (!locationGranted || !bluetoothGranted) {
            resolveTerminalPermissionResult(call, locationGranted, bluetoothGranted, false, false, false);
            return;
        }

        if ("usb".equalsIgnoreCase(method)) {
            // Do not pre-gate Stripe USB with a second UsbManager permission check.
            // Stripe Terminal's native SDK owns USB discovery/connection and will
            // surface the real USB state. The previous custom check could target
            // the wrong composite USB device and falsely report "USB access required"
            // even when Android had already granted SEZA access to the M2.
            resolveTerminalPermissionResult(
                call,
                locationGranted,
                bluetoothGranted,
                true,
                true,
                true
            );
            return;
        }

        resolveTerminalPermissionResult(call, locationGranted, bluetoothGranted, false, true, true);
    }

    private void resolveTerminalPermissionResult(
        PluginCall call,
        boolean locationGranted,
        boolean bluetoothGranted,
        boolean usbDeviceFound,
        boolean usbGranted,
        boolean granted
    ) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("locationGranted", locationGranted);
        result.put("bluetoothGranted", bluetoothGranted);
        result.put("usbDeviceFound", usbDeviceFound);
        result.put("usbGranted", usbGranted);
        call.resolve(result);
    }

    private UsbDevice findStripeUsbReader(UsbManager usbManager) {
        if (usbManager == null) return null;

        UsbDevice fallback = null;
        for (Map.Entry<String, UsbDevice> entry : usbManager.getDeviceList().entrySet()) {
            UsbDevice device = entry.getValue();
            if (device == null) continue;

            String manufacturer = "";
            String product = "";
            try {
                manufacturer = device.getManufacturerName() == null
                    ? ""
                    : device.getManufacturerName().toUpperCase(Locale.US);
            } catch (Exception ignored) {}
            try {
                product = device.getProductName() == null
                    ? ""
                    : device.getProductName().toUpperCase(Locale.US);
            } catch (Exception ignored) {}

            if (
                manufacturer.contains("BBPOS") ||
                manufacturer.contains("STRIPE") ||
                product.contains("STRIPE") ||
                product.contains("STRM2") ||
                product.contains("READER M2")
            ) {
                return device;
            }

            if (fallback == null && device.getDeviceClass() == 0) {
                fallback = device;
            }
        }
        return fallback;
    }

    private void requestStripeUsbPermission(
        PluginCall call,
        boolean locationGranted,
        boolean bluetoothGranted
    ) {
        UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        UsbDevice reader = findStripeUsbReader(usbManager);

        if (usbManager == null || reader == null) {
            resolveTerminalPermissionResult(
                call,
                locationGranted,
                bluetoothGranted,
                false,
                false,
                false
            );
            return;
        }

        if (usbManager.hasPermission(reader)) {
            resolveTerminalPermissionResult(
                call,
                locationGranted,
                bluetoothGranted,
                true,
                true,
                true
            );
            return;
        }

        final String action = getContext().getPackageName() + ".SEZA_STRIPE_USB_PERMISSION";
        Intent permissionIntent = new Intent(action).setPackage(getContext().getPackageName());

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            pendingFlags |= PendingIntent.FLAG_MUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            reader.getDeviceId(),
            permissionIntent,
            pendingFlags
        );

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!action.equals(intent.getAction())) return;

                boolean granted = intent.getBooleanExtra(
                    UsbManager.EXTRA_PERMISSION_GRANTED,
                    false
                );

                try {
                    context.unregisterReceiver(this);
                } catch (Exception ignored) {}

                resolveTerminalPermissionResult(
                    call,
                    locationGranted,
                    bluetoothGranted,
                    true,
                    granted,
                    granted
                );
            }
        };

        IntentFilter filter = new IntentFilter(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }

        try {
            usbManager.requestPermission(reader, pendingIntent);
        } catch (Exception error) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {}
            call.reject("Unable to request USB access for Reader M2", error);
        }
    }

    @PluginMethod
    public void getConnectivityState(PluginCall call) {
        JSObject result = new JSObject();
        PackageManager pm = getContext().getPackageManager();

        boolean wifiSupported = pm.hasSystemFeature(PackageManager.FEATURE_WIFI);
        boolean wifiEnabled = false;
        if (wifiSupported) {
            try {
                WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                wifiEnabled = wifi != null && wifi.isWifiEnabled();
            } catch (Exception ignored) {}
        }

        boolean bluetoothSupported = pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH)
            || pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE);
        Boolean bluetoothEnabled = null;
        if (bluetoothSupported) {
            try {
                BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
                BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
                if (adapter != null) bluetoothEnabled = adapter.isEnabled();
            } catch (SecurityException ignored) {
                bluetoothEnabled = null;
            } catch (Exception ignored) {
                bluetoothEnabled = null;
            }
        }

        result.put("wifiSupported", wifiSupported);
        result.put("wifiEnabled", wifiEnabled);
        result.put("bluetoothSupported", bluetoothSupported);
        result.put("bluetoothEnabled", bluetoothEnabled);
        call.resolve(result);
    }

    @PluginMethod
    public void openWifiSettings(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(Settings.ACTION_WIFI_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open Android Wi-Fi settings", e);
        }
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open Android Bluetooth settings", e);
        }
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
