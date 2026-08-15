package com.sezapos.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

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
        ensureCashierInteraction();
    }

    @Override
public void onResume() {
        super.onResume();
        SezaDeviceControlPlugin.applyWindowPreferences(this);
        ensureCashierInteraction();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            SezaDeviceControlPlugin.applyWindowPreferences(this);
            ensureCashierInteraction();
        }
    }

    /**
     * Keep the built-in cashier display as the only interactive window.
     * Secondary customer displays are passive Presentations and must never
     * leave the Capacitor Activity/WebView non-focusable or non-touchable.
     */
    public void ensureCashierInteraction() {
        runOnUiThread(() -> {
            if (getWindow() == null) return;

            getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            );

            View decor = getWindow().getDecorView();
            decor.setEnabled(true);
            decor.setClickable(true);
            decor.setFocusable(true);
            decor.setFocusableInTouchMode(true);
            decor.requestFocus();

            View content = findViewById(android.R.id.content);
            if (content != null) {
                content.setEnabled(true);
                content.setFocusable(true);
                content.setFocusableInTouchMode(true);
            }

            WebView webView = findCapacitorWebView(decor);
            if (webView != null) {
                webView.setEnabled(true);
                webView.setClickable(true);
                webView.setFocusable(true);
                webView.setFocusableInTouchMode(true);
                webView.requestFocus(View.FOCUS_DOWN);
            }

            decor.postDelayed(() -> {
                decor.requestFocus();
                WebView delayedWebView = findCapacitorWebView(decor);
                if (delayedWebView != null) {
                    delayedWebView.requestFocus(View.FOCUS_DOWN);
                }
            }, 150);
        });
    }

    private WebView findCapacitorWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof android.view.ViewGroup)) return null;
        android.view.ViewGroup group = (android.view.ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            WebView found = findCapacitorWebView(group.getChildAt(i));
            if (found != null) return found;
        }
        return null;
    }
}

