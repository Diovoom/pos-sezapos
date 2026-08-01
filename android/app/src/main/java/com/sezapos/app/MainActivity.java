package com.sezapos.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.sezapos.security.SezaSecureStoragePlugin;
import com.sezapos.screen.SezaScreenCapturePlugin;
import com.sezapos.share.SezaPdfSharePlugin;
import com.sezapos.device.SezaDeviceControlPlugin;
import com.sezapos.device.SezaUsbPrinterPlugin;
import com.sezapos.device.SezaCustomerDisplayPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SezaScreenCapturePlugin.class);
        registerPlugin(SezaSecureStoragePlugin.class);
        registerPlugin(SezaPdfSharePlugin.class);
        registerPlugin(SezaDeviceControlPlugin.class);
        registerPlugin(SezaUsbPrinterPlugin.class);
        registerPlugin(SezaCustomerDisplayPlugin.class);
        super.onCreate(savedInstanceState);
        SezaDeviceControlPlugin.applyWindowPreferences(this);
    }

    @Override
public void onResume() {
        super.onResume();
        SezaDeviceControlPlugin.applyWindowPreferences(this);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) SezaDeviceControlPlugin.applyWindowPreferences(this);
    }
}
