package com.sezapos.app;

import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebSettings;

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
        configureLegacyPosWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        SezaDeviceControlPlugin.applyWindowPreferences(this);
    }

    /** Keep SEZA usable on older Android POS WebViews. */
    private void configureLegacyPosWebView() {
        try {
            if (getWindow() == null) return;
            WebView webView = findCapacitorWebView(getWindow().getDecorView());
            if (webView == null) return;
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
        } catch (Throwable ignored) {
            // OEM/Android-x86 WebViews vary; never block startup here.
        }
    }

    /**
     * Bliss/Android-x86 can associate the physical front touch panel with the
     * secondary display after a Presentation is shown. When that happens the
     * Presentation forwards the local touch coordinates here and we dispatch
     * them directly to the cashier Capacitor WebView.
     */
    public void forwardCustomerDisplayTouch(MotionEvent source, int sourceWidth, int sourceHeight) {
        if (source == null || sourceWidth <= 0 || sourceHeight <= 0) return;

        final MotionEvent copy = MotionEvent.obtain(source);
        runOnUiThread(() -> {
            try {
                if (getWindow() == null) return;
                WebView cashier = findCapacitorWebView(getWindow().getDecorView());
                if (cashier == null || cashier.getWidth() <= 0 || cashier.getHeight() <= 0) return;

                float x = copy.getX() * ((float) cashier.getWidth() / (float) sourceWidth);
                float y = copy.getY() * ((float) cashier.getHeight() / (float) sourceHeight);
                copy.setLocation(x, y);
                cashier.dispatchTouchEvent(copy);
            } finally {
                copy.recycle();
            }
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
