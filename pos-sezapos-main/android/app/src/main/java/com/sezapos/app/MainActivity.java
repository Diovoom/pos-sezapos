package com.sezapos.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.sezapos.screen.SezaScreenCapturePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SezaScreenCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
