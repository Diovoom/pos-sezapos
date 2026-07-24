package com.sezapos.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.sezapos.security.SezaSecureStoragePlugin;
import com.sezapos.screen.SezaScreenCapturePlugin;
import com.sezapos.share.SezaPdfSharePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SezaScreenCapturePlugin.class);
        registerPlugin(SezaSecureStoragePlugin.class);
        registerPlugin(SezaPdfSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
