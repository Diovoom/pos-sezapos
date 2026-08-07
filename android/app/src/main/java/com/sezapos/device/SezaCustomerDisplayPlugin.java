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

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SezaCustomerDisplay")
public class SezaCustomerDisplayPlugin extends Plugin implements DisplayManager.DisplayListener {
    private CustomerPresentation presentation;
    private int activeDisplayId = -1;
    private String lastPayload = "{}";
    private String storeName = "SEZA POS";
    private DisplayManager displayManager;

    @Override
    public void load() {
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        displayManager.registerDisplayListener(this, null);
    }

    @PluginMethod
    public void listDisplays(PluginCall call) {
        JSArray rows = new JSArray();
        int primary = primaryDisplayId();
        for (Display display : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (display.getDisplayId() == primary) continue;
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
        storeName = call.getString("storeName", "SEZA POS");
        Display chosen = findSecondary(requestedId);
        if (chosen == null) {
            call.reject("No secondary customer display was detected");
            return;
        }
        final Display display = chosen;
        getActivity().runOnUiThread(() -> {
            try {
                stopPresentation();
                // Always begin with a clean idle screen. The POS cart publisher will
                // immediately replace this when a sale is already in progress.
                lastPayload = idlePayload(storeName);
                presentation = new CustomerPresentation(getContext(), display);
                presentation.show();
                activeDisplayId = display.getDisplayId();
                presentation.render(lastPayload);

                // The customer Presentation is intentionally non-focusable. Request
                // focus back on the cashier Activity as an extra safeguard for POS
                // hardware whose touch controller is attached to the primary display.
                if (getActivity().getWindow() != null) {
                    getActivity().getWindow().getDecorView().requestFocus();
                }

                JSObject result = new JSObject();
                result.put("started", true);
                result.put("displayId", activeDisplayId);
                call.resolve(result);
            } catch (Exception e) {
                stopPresentation();
                call.reject("Could not start customer display: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        lastPayload = call.getString("payload", "{}");
        getActivity().runOnUiThread(() -> {
            if (presentation != null && presentation.isShowing()) {
                presentation.render(lastPayload);
            }
            call.resolve();
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

    private int primaryDisplayId() {
        return getActivity() != null && getActivity().getDisplay() != null
            ? getActivity().getDisplay().getDisplayId()
            : Display.DEFAULT_DISPLAY;
    }

    private Display findSecondary(int requestedId) {
        for (Display display : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (display.getDisplayId() == primaryDisplayId()) continue;
            if (!display.isValid()) continue;
            if (requestedId >= 0 && display.getDisplayId() != requestedId) continue;
            return display;
        }
        return null;
    }

    private void stopPresentation() {
        if (presentation != null) {
            try {
                presentation.dismiss();
            } catch (Exception ignored) {
                // Best effort; a disconnected display may already have destroyed it.
            }
            presentation = null;
        }
        activeDisplayId = -1;
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
    protected void handleOnDestroy() {
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        stopPresentation();
        super.handleOnDestroy();
    }

    @Override public void onDisplayAdded(int id) {}
    @Override public void onDisplayChanged(int id) {}

    @Override
    public void onDisplayRemoved(int id) {
        if (id == activeDisplayId && getActivity() != null) {
            getActivity().runOnUiThread(this::stopPresentation);
        }
    }

    private static class CustomerPresentation extends Presentation {
        private WebView webView;
        private boolean pageReady = false;
        private String pendingPayload = "{}";

        CustomerPresentation(Context context, Display display) {
            super(context, display);
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            Window window = getWindow();
            if (window != null) {
                window.setFlags(
                    WindowManager.LayoutParams.FLAG_FULLSCREEN,
                    WindowManager.LayoutParams.FLAG_FULLSCREEN
                );
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
            webView.setBackgroundColor(0xfff8fafc);
            webView.setFocusable(false);
            webView.setFocusableInTouchMode(false);
            webView.setClickable(false);
            webView.setLongClickable(false);
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    pageReady = true;
                    render(pendingPayload);
                }
            });
            setContentView(webView);
            webView.loadDataWithBaseURL(null, html(), "text/html", "UTF-8", null);
        }

        void render(String payload) {
            pendingPayload = payload == null ? "{}" : payload;
            if (webView == null || !pageReady) return;
            final String safe = android.util.Base64.encodeToString(
                pendingPayload.getBytes(StandardCharsets.UTF_8),
                android.util.Base64.NO_WRAP
            );
            webView.evaluateJavascript("window.SEZA_RENDER(atob('" + safe + "'))", null);
        }

        private String html() {
            return String.join("",
                "<!doctype html><html><head>",
                "<meta name='viewport' content='width=device-width,initial-scale=1'>",
                "<style>",
                "*{box-sizing:border-box}html,body{width:100%;height:100%}",
                "body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;overflow:hidden}",
                ".wrap{height:100vh;display:grid;grid-template-rows:auto 1fr}",
                ".head{padding:24px 32px;border-bottom:1px solid #e2e8f0;font-size:28px;font-weight:900;letter-spacing:-.02em;background:white}",
                ".main{min-height:0;display:flex;flex-direction:column}",
                ".center{height:100%;display:grid;place-items:center;text-align:center;padding:34px}",
                ".message{font-size:54px;line-height:1.05;font-weight:900;letter-spacing:-.035em}",
                ".sub{margin-top:14px;color:#64748b;font-size:24px}",
                ".amount{margin-top:22px;font-size:46px;font-weight:900;color:#1d4ed8}",
                ".change{margin:22px auto 0;padding:14px 24px;border-radius:14px;background:#dcfce7;color:#166534;font-size:28px;font-weight:800}",
                ".mark{width:78px;height:78px;margin:0 auto 22px;border-radius:999px;display:grid;place-items:center;background:#dcfce7;color:#15803d;font-size:44px;font-weight:900}",
                ".items{flex:1;min-height:0;padding:18px 32px;overflow:auto}",
                ".row{display:flex;justify-content:space-between;gap:22px;padding:14px 0;border-bottom:1px solid #e2e8f0;font-size:22px}",
                ".rowName{min-width:0;font-weight:800;overflow-wrap:anywhere}",
                ".muted{margin-top:4px;color:#64748b;font-size:16px;font-weight:400}",
                ".lineTotal{white-space:nowrap;font-weight:900}",
                ".foot{padding:18px 32px 22px;background:white;border-top:1px solid #e2e8f0}",
                ".sum{display:flex;justify-content:space-between;font-size:20px;margin:7px 0}",
                ".total{font-size:36px;font-weight:900;color:#1d4ed8;margin-top:12px;padding-top:12px;border-top:1px dashed #cbd5e1}",
                "</style></head><body><div id='app'></div><script>",
                "window.SEZA_RENDER=function(raw){",
                "let p={};try{p=JSON.parse(raw)}catch(e){};",
                "const lines=Array.isArray(p.lines)?p.lines:[];",
                "const phase=p.phase||'idle';",
                "const currency=p.currency||'USD';",
                "const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(v||0));",
                "const esc=v=>String(v||'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]));",
                "let main='';",
                "if(phase==='complete'){",
                "main=`<div class='center'><div><div class='mark'>&#10003;</div><div class='message'>Thank you!</div><div class='sub'>Payment approved</div><div class='amount'>${money(p.total)}</div>${Number(p.changeDue||0)>0?`<div class='change'>Change due: ${money(p.changeDue)}</div>`:''}</div></div>`;",
                "}else if(phase==='processing'){",
                "main=`<div class='center'><div><div class='message'>Processing payment&hellip;</div><div class='sub'>${esc(p.statusMessage||'Please wait.')}</div><div class='amount'>${money(p.total)}</div></div></div>`;",
                "}else if(phase==='declined'){",
                "main=`<div class='center'><div><div class='message'>Payment declined</div><div class='sub'>${esc(p.statusMessage||'Please try another payment method.')}</div></div></div>`;",
                "}else if(phase==='cancelled'){",
                "main=`<div class='center'><div><div class='message'>Sale cancelled</div><div class='sub'>${esc(p.statusMessage||'The register is ready for a new sale.')}</div></div></div>`;",
                "}else if(lines.length){",
                "const rows=lines.map(x=>`<div class='row'><div class='rowName'>${esc(x.name)}<div class='muted'>${Number(x.qty||0)} &times; ${money(x.unitPrice)}</div></div><div class='lineTotal'>${money(x.lineTotal)}</div></div>`).join('');",
                "const discount=Number(p.discount||0)>0?`<div class='sum'><span>Discount</span><b>&minus; ${money(p.discount)}</b></div>`:'';",
                "main=`<div class='items'>${rows}</div><div class='foot'><div class='sum'><span>Subtotal</span><b>${money(p.subtotal)}</b></div>${discount}<div class='sum'><span>Tax</span><b>${money(p.tax)}</b></div><div class='sum total'><span>Total</span><span>${money(p.total)}</span></div></div>`;",
                "}else{",
                "main=`<div class='center'><div class='message'>Welcome</div></div>`;",
                "}",
                "document.getElementById('app').innerHTML=`<div class='wrap'><div class='head'>${esc(p.storeName||'SEZA POS')}</div><div class='main'>${main}</div></div>`;",
                "};",
                "</script></body></html>"
            );
        }
    }
}
