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
            row.put("printerCandidate", findOutputEndpoint(d) != null);
            UsbEndpoint candidate = findOutputEndpoint(d);
            row.put("endpointType", candidate != null ? candidate.getType() : -1);
            row.put("interfaceCount", d.getInterfaceCount());
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
        out.put("ready", d != null && manager.hasPermission(d) && findOutputEndpoint(d) != null);
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
        UsbEndpoint endpoint = findOutputEndpoint(d);
        String manufacturer = d.getManufacturerName() != null ? d.getManufacturerName() : "Unknown";
        String model = d.getProductName() != null ? d.getProductName() : d.getDeviceName();
        String serial = "Unavailable";
        try {
            String value = d.getSerialNumber();
            if (value != null && !value.trim().isEmpty()) serial = value;
        } catch (SecurityException ignored) {}
        String endpointType = endpoint == null ? "None" :
            endpoint.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK ? "USB BULK" :
            endpoint.getType() == UsbConstants.USB_ENDPOINT_XFER_INT ? "USB INTERRUPT" : "USB OTHER";

        StringBuilder report = new StringBuilder();
        report.append("SEZA POS\n");
        report.append("PRINTER DIAGNOSTIC TEST\n");
        report.append("================================\n");
        report.append("Result: READY\n");
        report.append("Date: ").append(new java.util.Date()).append("\n");
        report.append("\nPRINTER INFORMATION\n");
        report.append("Manufacturer: ").append(manufacturer).append("\n");
        report.append("Model: ").append(model).append("\n");
        report.append("Serial: ").append(serial).append("\n");
        report.append("Vendor ID: ").append(d.getVendorId()).append("\n");
        report.append("Product ID: ").append(d.getProductId()).append("\n");
        report.append("Device ID: ").append(d.getDeviceId()).append("\n");
        report.append("Interfaces: ").append(d.getInterfaceCount()).append("\n");
        report.append("Transport: ").append(endpointType).append("\n");
        report.append("USB permission: GRANTED\n");
        report.append("\nANDROID INFORMATION\n");
        report.append("Android SDK: ").append(Build.VERSION.SDK_INT).append("\n");
        report.append("Android: ").append(Build.VERSION.RELEASE).append("\n");
        report.append("SEZA package: ").append(getContext().getPackageName()).append("\n");
        report.append("\nPRINT QUALITY TEST\n");
        report.append("ABCDEFGHIJKLMNOPQRSTUVWXYZ\n");
        report.append("abcdefghijklmnopqrstuvwxyz\n");
        report.append("0123456789 !@#$%^&*()\n");
        report.append("--------------------------------\n");
        report.append("LEFT\n");
        report.append("          CENTER\n");
        report.append("                         RIGHT\n");
        report.append("--------------------------------\n");
        report.append("Drawer control: Supported by SEZA\n");
        report.append("Auto cut: Command sent below\n");
        report.append("\nTEST COMPLETE - PRINTER READY\n");
        report.append("Keep this receipt for diagnostics.\n\n\n");

        byte[] init = new byte[]{0x1b, 0x40};
        byte[] boldOn = new byte[]{0x1b, 0x45, 0x01};
        byte[] boldOff = new byte[]{0x1b, 0x45, 0x00};
        byte[] title = "SEZA POS PRINTER TEST\n".getBytes(StandardCharsets.UTF_8);
        byte[] text = report.toString().getBytes(StandardCharsets.UTF_8);
        byte[] cut = new byte[]{0x1d, 0x56, 0x42, 0x00};
        byte[] all = new byte[init.length + boldOn.length + title.length + boldOff.length + text.length + cut.length];
        int offset = 0;
        System.arraycopy(init,0,all,offset,init.length); offset += init.length;
        System.arraycopy(boldOn,0,all,offset,boldOn.length); offset += boldOn.length;
        System.arraycopy(title,0,all,offset,title.length); offset += title.length;
        System.arraycopy(boldOff,0,all,offset,boldOff.length); offset += boldOff.length;
        System.arraycopy(text,0,all,offset,text.length); offset += text.length;
        System.arraycopy(cut,0,all,offset,cut.length);
        try {
            int written = writeBytes(d, all);
            JSObject out = new JSObject();
            out.put("bytesWritten", written);
            out.put("manufacturer", manufacturer);
            out.put("model", model);
            out.put("vendorId", d.getVendorId());
            out.put("productId", d.getProductId());
            call.resolve(out);
        } catch (Exception e) { call.reject("Test print failed: " + e.getMessage(), e); }
    }

    private UsbDevice findDevice(int id) {
        for (UsbDevice d : manager.getDeviceList().values()) if (d.getDeviceId() == id) return d;
        return null;
    }

    private UsbEndpoint findOutputEndpoint(UsbDevice d) {
        UsbEndpoint interruptFallback = null;
        for (int i=0; i<d.getInterfaceCount(); i++) {
            UsbInterface intf = d.getInterface(i);
            for (int e=0; e<intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getDirection() != UsbConstants.USB_DIR_OUT) continue;
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) return ep;
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_INT && interruptFallback == null) interruptFallback = ep;
            }
        }
        return interruptFallback;
    }

    private int writeBytes(UsbDevice d, byte[] bytes) throws Exception {
        Exception lastError = null;
        for (int i=0; i<d.getInterfaceCount(); i++) {
            UsbInterface intf = d.getInterface(i);
            for (int e=0; e<intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getDirection() != UsbConstants.USB_DIR_OUT) continue;
                if (ep.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getType() != UsbConstants.USB_ENDPOINT_XFER_INT) continue;
                UsbDeviceConnection connection = manager.openDevice(d);
                if (connection == null) { lastError = new Exception("Could not open USB device"); continue; }
                try {
                    if (!connection.claimInterface(intf, true)) throw new Exception("Could not claim interface " + i);
                    int offset = 0;
                    while (offset < bytes.length) {
                        int length = Math.min(4096, bytes.length - offset);
                        byte[] chunk = new byte[length];
                        System.arraycopy(bytes, offset, chunk, 0, length);
                        int sent = connection.bulkTransfer(ep, chunk, length, 5000);
                        if (sent <= 0) throw new Exception("Endpoint " + e + " rejected printer data");
                        offset += sent;
                    }
                    return offset;
                } catch (Exception error) {
                    lastError = error;
                } finally {
                    try { connection.releaseInterface(intf); } catch (Exception ignored) {}
                    connection.close();
                }
            }
        }
        if (lastError != null) throw lastError;
        throw new Exception("No writable USB printer endpoint");
    }
}
