package com.sezapos.device;

import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SezaCustomerDisplay")
public class SezaCustomerDisplayPlugin extends Plugin {
    private CustomerPresentation presentation;
    private int activeDisplayId = -1;

    @PluginMethod
    public void listDisplays(PluginCall call) {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display[] displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        JSArray rows = new JSArray();
        for (Display display : displays) {
            JSObject row = new JSObject();
            row.put("displayId", display.getDisplayId());
            row.put("name", display.getName());
            row.put("state", display.getState());
            row.put("valid", display.isValid());
            row.put("active", presentation != null && activeDisplayId == display.getDisplayId());
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
        String storeId = call.getString("storeId", "");
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display chosen = null;
        Display[] displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        for (Display display : displays) {
            if ((requestedId < 0 || display.getDisplayId() == requestedId) && display.isValid()) {
                chosen = display;
                break;
            }
        }
        if (chosen == null) {
            call.reject("No secondary customer display was detected");
            return;
        }
        final Display display = chosen;
        final String url = buildCustomerDisplayUrl(storeId);
        getActivity().runOnUiThread(() -> {
            try {
                stopPresentation();
                presentation = new CustomerPresentation(getContext(), display, url);
                presentation.show();
                activeDisplayId = display.getDisplayId();
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("displayId", activeDisplayId);
                result.put("url", url);
                call.resolve(result);
            } catch (Exception error) {
                stopPresentation();
                call.reject("Could not start customer display: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopPresentation();
            call.resolve();
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", presentation != null && presentation.isShowing());
        result.put("displayId", activeDisplayId);
        call.resolve(result);
    }

    private String buildCustomerDisplayUrl(String storeId) {
        String base = getBridge().getServerUrl().toString();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        String encoded = android.net.Uri.encode(storeId == null ? "" : storeId);
        return base + "/customer-display?store=" + encoded;
    }

    private void stopPresentation() {
        if (presentation != null) {
            try { presentation.dismiss(); } catch (Exception ignored) {}
            presentation = null;
        }
        activeDisplayId = -1;
    }

    @Override
    protected void handleOnDestroy() {
        stopPresentation();
        super.handleOnDestroy();
    }

    private static class CustomerPresentation extends Presentation {
        private final String url;

        CustomerPresentation(Context context, Display display, String url) {
            super(context, display);
            this.url = url;
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            Window window = getWindow();
            if (window != null) {
                window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            WebView webView = new WebView(getContext());
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            webView.setWebViewClient(new WebViewClient());
            webView.setBackgroundColor(android.graphics.Color.rgb(2, 6, 23));
            setContentView(webView);
            webView.loadUrl(url);
        }
    }
}
