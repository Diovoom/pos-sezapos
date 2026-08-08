package com.sezapos.device;

import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Display;
import android.view.View;
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
import com.sezapos.app.MainActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Customer-facing output rendered with Android Presentation.
 *
 * Important: this never launches a second Activity/task. On POS hardware a
 * second Activity can become the active task and steal touchscreen routing,
 * produce multiple SEZA icons, or leave a frozen task behind. Presentation is
 * the Android API intended for a passive secondary display.
 */
@CapacitorPlugin(name = "SezaCustomerDisplay")
public class SezaCustomerDisplayPlugin extends Plugin implements DisplayManager.DisplayListener {
    public static final String PREFS = "seza_customer_display";
    public static final String PREF_ENABLED = "enabled";
    public static final String PREF_DISPLAY_ID = "display_id";
    public static final String PREF_STORE_NAME = "store_name";
    public static final String PREF_PAYLOAD = "payload";

    private DisplayManager displayManager;
    private CustomerPresentation presentation;
    private int activeDisplayId = -1;
    private String storeName = "SEZA POS";
    private String lastPayload = "{}";
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        if (displayManager != null) displayManager.registerDisplayListener(this, null);
        main.postDelayed(this::restoreSavedDisplay, 450);
    }

    @PluginMethod
    public void listDisplays(PluginCall call) {
        JSArray rows = new JSArray();
        int primary = primaryDisplayId();
        if (displayManager != null) {
            for (Display display : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
                if (display.getDisplayId() == primary) continue;
                JSObject row = new JSObject();
                row.put("displayId", display.getDisplayId());
                row.put("name", display.getName());
                row.put("state", display.getState());
                row.put("valid", display.isValid());
                row.put("active", presentation != null && presentation.isShowing() && activeDisplayId == display.getDisplayId());
                rows.put(row);
            }
        }
        JSObject result = new JSObject();
        result.put("displays", rows);
        result.put("activeDisplayId", activeDisplayId);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        final int requestedId = call.getInt("displayId", -1);
        storeName = call.getString("storeName", "SEZA POS");
        final Display chosen = findSecondary(requestedId);
        if (chosen == null) {
            call.reject("No secondary customer display was detected");
            return;
        }

        lastPayload = idlePayload(storeName);
        saveState(true, chosen.getDisplayId(), storeName, lastPayload);
        main.post(() -> {
            try {
                showPresentation(chosen);
                refocusCashier();
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("displayId", chosen.getDisplayId());
                call.resolve(result);
            } catch (Exception error) {
                dismissPresentation();
                saveState(false, -1, storeName, lastPayload);
                call.reject("Could not start customer display: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        lastPayload = call.getString("payload", "{}");
        displayPrefs().edit().putString(PREF_PAYLOAD, lastPayload).apply();
        main.post(() -> {
            if (presentation != null && presentation.isShowing()) presentation.render(lastPayload);
        });
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        saveState(false, -1, storeName, lastPayload);
        main.post(this::dismissPresentation);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        boolean running = presentation != null && presentation.isShowing();
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
        activeDisplayId = displayId;
    }

    private void restoreSavedDisplay() {
        if (getActivity() == null || displayManager == null || !isEnabled()) return;
        int savedId = displayPrefs().getInt(PREF_DISPLAY_ID, -1);
        storeName = displayPrefs().getString(PREF_STORE_NAME, "SEZA POS");
        lastPayload = displayPrefs().getString(PREF_PAYLOAD, idlePayload(storeName));
        Display chosen = findSecondary(savedId);
        if (chosen == null) chosen = findSecondary(-1);
        if (chosen == null) return;
        final Display target = chosen;
        main.post(() -> {
            showPresentation(target);
            refocusCashier();
        });
    }

    private void showPresentation(Display display) {
        if (getActivity() == null || display == null || !display.isValid()) return;
        if (presentation != null && presentation.isShowing() && activeDisplayId == display.getDisplayId()) {
            presentation.render(lastPayload);
            return;
        }
        dismissPresentation();
        activeDisplayId = display.getDisplayId();
        presentation = new CustomerPresentation(getActivity(), display);
        presentation.setOnDismissListener(dialog -> {
            if (presentation == dialog) presentation = null;
        });
        presentation.show();
        presentation.render(lastPayload);
        saveState(true, activeDisplayId, storeName, lastPayload);
    }

    private void dismissPresentation() {
        if (presentation != null) {
            try { presentation.dismiss(); } catch (Exception ignored) {}
            presentation = null;
        }
        activeDisplayId = -1;
        refocusCashier();
    }

    private void refocusCashier() {
        if (getActivity() == null || getActivity().getWindow() == null) return;

        // The secondary Presentation is output-only. Explicitly restore the
        // built-in cashier Activity/WebView because some dual-screen POS
        // firmware changes window focus/input routing when a Presentation is
        // attached even when that Presentation itself is NOT_FOCUSABLE.
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).ensureCashierInteraction();
            return;
        }

        View decor = getActivity().getWindow().getDecorView();
        getActivity().getWindow().clearFlags(
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        );
        decor.setEnabled(true);
        decor.setClickable(true);
        decor.setFocusable(true);
        decor.setFocusableInTouchMode(true);
        decor.requestFocus();
        decor.postDelayed(decor::requestFocus, 150);
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
        if (isEnabled() && (presentation == null || !presentation.isShowing())) {
            main.postDelayed(this::restoreSavedDisplay, 200);
        } else {
            refocusCashier();
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        dismissPresentation();
        super.handleOnDestroy();
    }

    @Override public void onDisplayAdded(int id) {
        main.postDelayed(this::restoreSavedDisplay, 300);
        main.postDelayed(this::refocusCashier, 500);
    }

    @Override
    public void onDisplayChanged(int id) {
        if (id == activeDisplayId && presentation != null) {
            main.post(() -> {
                presentation.render(lastPayload);
                refocusCashier();
            });
        }
    }

    @Override
    public void onDisplayRemoved(int id) {
        if (id == activeDisplayId) main.post(() -> {
            dismissPresentation();
            refocusCashier();
        });
    }

    private class CustomerPresentation extends Presentation {
        private WebView webView;
        private boolean pageReady = false;
        private String pending = "{}";

        CustomerPresentation(Context context, Display display) {
            super(context, display);
        }

        @Override
        protected void onStart() {
            super.onStart();
            Window window = getWindow();
            if (window != null) {
                window.addFlags(
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM
                );
            }
            main.post(SezaCustomerDisplayPlugin.this::refocusCashier);
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            Window window = getWindow();
            if (window != null) {
                window.addFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM
                );
                window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            }

            webView = new WebView(getContext());
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            webView.setBackgroundColor(0xfff8fafc);
            webView.setFocusable(false);
            webView.setFocusableInTouchMode(false);
            webView.setClickable(false);
            webView.setLongClickable(false);
            webView.setOnTouchListener((v, event) -> true);
            webView.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) {
                    pageReady = true;
                    render(pending);
                }
            });
            setContentView(webView);
            webView.loadDataWithBaseURL(null, html(), "text/html", "UTF-8", null);
        }

        void render(String payload) {
            pending = payload == null ? "{}" : payload;
            if (webView == null || !pageReady) return;
            String safe = Base64.encodeToString(pending.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            webView.evaluateJavascript("window.SEZA_RENDER(atob('" + safe + "'))", null);
        }

        @Override protected void onStop() {
            super.onStop();
            if (webView != null) webView.onPause();
        }

        private String html() {
            return String.join("",
                "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>",
                "<style>*{box-sizing:border-box}html,body{width:100%;height:100%}body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;overflow:hidden}.wrap{height:100vh;display:grid;grid-template-rows:auto 1fr}.head{padding:24px 32px;border-bottom:1px solid #e2e8f0;font-size:28px;font-weight:900;background:white}.main{min-height:0;display:flex;flex-direction:column}.center{height:100%;display:grid;place-items:center;text-align:center;padding:34px}.message{font-size:54px;line-height:1.05;font-weight:900}.sub{margin-top:14px;color:#64748b;font-size:24px}.amount{margin-top:22px;font-size:46px;font-weight:900;color:#1d4ed8}.change{margin:22px auto 0;padding:14px 24px;border-radius:14px;background:#dcfce7;color:#166534;font-size:28px;font-weight:800}.mark{width:78px;height:78px;margin:0 auto 22px;border-radius:999px;display:grid;place-items:center;background:#dcfce7;color:#15803d;font-size:44px;font-weight:900}.items{flex:1;min-height:0;padding:18px 32px;overflow:auto}.row{display:flex;justify-content:space-between;gap:22px;padding:14px 0;border-bottom:1px solid #e2e8f0;font-size:22px}.rowName{min-width:0;font-weight:800;overflow-wrap:anywhere}.muted{margin-top:4px;color:#64748b;font-size:16px;font-weight:400}.lineTotal{white-space:nowrap;font-weight:900}.foot{padding:18px 32px 22px;background:white;border-top:1px solid #e2e8f0}.sum{display:flex;justify-content:space-between;font-size:20px;margin:7px 0}.total{font-size:36px;font-weight:900;color:#1d4ed8;margin-top:12px;padding-top:12px;border-top:1px dashed #cbd5e1}</style>",
                "</head><body><div id='app'></div><script>window.SEZA_RENDER=function(raw){let p={};try{p=JSON.parse(raw)}catch(e){};const lines=Array.isArray(p.lines)?p.lines:[];const phase=p.phase||'idle';const currency=p.currency||'USD';const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(v||0));const esc=v=>String(v||'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]));let main='';if(phase==='complete'){main=`<div class='center'><div><div class='mark'>&#10003;</div><div class='message'>Thank you!</div>${Number(p.changeDue||0)>0?`<div class='change'>Change due: ${money(p.changeDue)}</div>`:''}</div></div>`;}else if(phase==='processing'){main=`<div class='center'><div><div class='message'>Processing payment&hellip;</div><div class='sub'>${esc(p.statusMessage||'Please wait.')}</div><div class='amount'>${money(p.total)}</div></div></div>`;}else if(phase==='declined'){main=`<div class='center'><div><div class='message'>Payment declined</div><div class='sub'>${esc(p.statusMessage||'Please try another payment method.')}</div></div></div>`;}else if(lines.length){const rows=lines.map(x=>`<div class='row'><div class='rowName'>${esc(x.name)}<div class='muted'>${Number(x.qty||0)} &times; ${money(x.unitPrice)}</div></div><div class='lineTotal'>${money(x.lineTotal)}</div></div>`).join('');const discount=Number(p.discount||0)>0?`<div class='sum'><span>Discount</span><b>&minus; ${money(p.discount)}</b></div>`:'';main=`<div class='items'>${rows}</div><div class='foot'><div class='sum'><span>Subtotal</span><b>${money(p.subtotal)}</b></div>${discount}<div class='sum'><span>Tax</span><b>${money(p.tax)}</b></div><div class='sum total'><span>Total</span><span>${money(p.total)}</span></div></div>`;}else{main=`<div class='center'><div class='message'>Welcome</div></div>`;}document.getElementById('app').innerHTML=`<div class='wrap'><div class='head'>${esc(p.storeName||'SEZA POS')}</div><div class='main'>${main}</div></div>`;};</script></body></html>"
            );
        }
    }
}
