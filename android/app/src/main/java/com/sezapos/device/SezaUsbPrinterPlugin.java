package com.sezapos.device;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;

@CapacitorPlugin(name = "SezaUsbPrinter")
public class SezaUsbPrinterPlugin extends Plugin {
    private static final String ACTION_USB_PERMISSION = "com.sezapos.app.USB_PERMISSION";
    private UsbManager manager;
    private PluginCall permissionCall;
    private int pendingDeviceId = -1;

    @Override
    public void load() {
        manager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(permissionReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try { getContext().unregisterReceiver(permissionReceiver); } catch (Exception ignored) {}
        super.handleOnDestroy();
    }

    private final BroadcastReceiver permissionReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!ACTION_USB_PERMISSION.equals(intent.getAction()) || permissionCall == null) return;
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
            JSObject out = new JSObject();
            out.put("granted", granted);
            out.put("deviceId", device != null ? device.getDeviceId() : pendingDeviceId);
            permissionCall.resolve(out);
            permissionCall = null;
            pendingDeviceId = -1;
        }
    };

    @PluginMethod
    public void listDevices(PluginCall call) {
        JSArray rows = new JSArray();
        HashMap<String, UsbDevice> devices = manager.getDeviceList();
        for (UsbDevice d : devices.values()) {
            JSObject row = new JSObject();
            row.put("deviceId", d.getDeviceId());
            row.put("vendorId", d.getVendorId());
            row.put("productId", d.getProductId());
            row.put("name", d.getProductName() != null ? d.getProductName() : d.getDeviceName());
            row.put("manufacturer", d.getManufacturerName());
            row.put("permission", manager.hasPermission(d));
            row.put("printerCandidate", findBulkOut(d) != null);
            rows.put(row);
        }
        JSObject out = new JSObject();
        out.put("devices", rows);
        call.resolve(out);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        int deviceId = call.getInt("deviceId", -1);
        UsbDevice device = findDevice(deviceId);
        if (device == null) { call.reject("USB device not found"); return; }
        if (manager.hasPermission(device)) {
            JSObject out = new JSObject(); out.put("granted", true); out.put("deviceId", deviceId); call.resolve(out); return;
        }
        if (permissionCall != null) { call.reject("Another USB permission request is active"); return; }
        permissionCall = call;
        pendingDeviceId = deviceId;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(getContext(), deviceId, new Intent(ACTION_USB_PERMISSION).setPackage(getContext().getPackageName()), flags);
        manager.requestPermission(device, pi);
    }

    @PluginMethod
    public void status(PluginCall call) {
        int deviceId = call.getInt("deviceId", -1);
        UsbDevice d = findDevice(deviceId);
        JSObject out = new JSObject();
        out.put("connected", d != null);
        out.put("permission", d != null && manager.hasPermission(d));
        out.put("ready", d != null && manager.hasPermission(d) && findBulkOut(d) != null);
        call.resolve(out);
    }

    @PluginMethod
    public void write(PluginCall call) {
        int deviceId = call.getInt("deviceId", -1);
        String base64 = call.getString("base64", "");
        UsbDevice d = findDevice(deviceId);
        if (d == null) { call.reject("USB printer disconnected"); return; }
        if (!manager.hasPermission(d)) { call.reject("USB permission not granted"); return; }
        byte[] bytes;
        try { bytes = Base64.decode(base64, Base64.DEFAULT); }
        catch (Exception e) { call.reject("Invalid print data", e); return; }
        try {
            int written = writeBytes(d, bytes);
            JSObject out = new JSObject(); out.put("bytesWritten", written); call.resolve(out);
        } catch (Exception e) { call.reject("USB print failed: " + e.getMessage(), e); }
    }

    @PluginMethod
    public void testPrint(PluginCall call) {
        int deviceId = call.getInt("deviceId", -1);
        UsbDevice d = findDevice(deviceId);
        if (d == null || !manager.hasPermission(d)) { call.reject("USB printer is not ready"); return; }
        byte[] init = new byte[]{0x1b, 0x40};
        byte[] text = ("SEZA POS\nUSB PRINTER TEST\n" + new java.util.Date() + "\n\n\n").getBytes(StandardCharsets.UTF_8);
        byte[] cut = new byte[]{0x1d, 0x56, 0x42, 0x00};
        byte[] all = new byte[init.length + text.length + cut.length];
        System.arraycopy(init,0,all,0,init.length); System.arraycopy(text,0,all,init.length,text.length); System.arraycopy(cut,0,all,init.length+text.length,cut.length);
        try { writeBytes(d, all); call.resolve(); } catch (Exception e) { call.reject("Test print failed", e); }
    }

    private UsbDevice findDevice(int id) {
        for (UsbDevice d : manager.getDeviceList().values()) if (d.getDeviceId() == id) return d;
        return null;
    }

    private UsbEndpoint findBulkOut(UsbDevice d) {
        for (int i=0; i<d.getInterfaceCount(); i++) {
            UsbInterface intf = d.getInterface(i);
            for (int e=0; e<intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getDirection() == UsbConstants.USB_DIR_OUT && ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) return ep;
            }
        }
        return null;
    }

    private int writeBytes(UsbDevice d, byte[] bytes) throws Exception {
        UsbInterface chosen = null; UsbEndpoint out = null;
        for (int i=0; i<d.getInterfaceCount() && out == null; i++) {
            UsbInterface intf = d.getInterface(i);
            for (int e=0; e<intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getDirection() == UsbConstants.USB_DIR_OUT && ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) { chosen = intf; out = ep; break; }
            }
        }
        if (chosen == null || out == null) throw new Exception("No USB bulk output endpoint");
        UsbDeviceConnection connection = manager.openDevice(d);
        if (connection == null) throw new Exception("Could not open USB device");
        try {
            if (!connection.claimInterface(chosen, true)) throw new Exception("Could not claim printer interface");
            int offset = 0;
            while (offset < bytes.length) {
                int length = Math.min(4096, bytes.length - offset);
                byte[] chunk = new byte[length]; System.arraycopy(bytes, offset, chunk, 0, length);
                int sent = connection.bulkTransfer(out, chunk, length, 5000);
                if (sent < 0) throw new Exception("Printer stopped accepting data");
                offset += sent;
            }
            return offset;
        } finally {
            try { connection.releaseInterface(chosen); } catch (Exception ignored) {}
            connection.close();
        }
    }
}
