package com.sezapos.device;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.nio.charset.StandardCharsets;

/** Passive customer-facing UI hosted on the physical secondary display. */
public class SezaCustomerDisplayActivity extends Activity {
    public static final String ACTION_UPDATE = "com.sezapos.app.CUSTOMER_DISPLAY_UPDATE";
    public static final String ACTION_STOP = "com.sezapos.app.CUSTOMER_DISPLAY_STOP";

    private static volatile boolean running = false;
    private WebView webView;
    private boolean pageReady = false;
    private String pendingPayload = "{}";

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_STOP.equals(intent.getAction())) {
                finishAndRemoveTask();
                return;
            }
            if (ACTION_UPDATE.equals(intent.getAction())) render(readPayload());
        }
    };

    public static boolean isRunning() {
        return running;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        running = true;
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        Window window = getWindow();
        if (window != null) {
            window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    | WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM
            );
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }

        webView = new WebView(this);
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
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                render(readPayload());
            }
        });
        setContentView(webView);
        webView.loadDataWithBaseURL(null, html(), "text/html", "UTF-8", null);

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_UPDATE);
        filter.addAction(ACTION_STOP);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(receiver, filter);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        running = true;
        render(readPayload());
    }

    @Override
    protected void onDestroy() {
        running = false;
        try { unregisterReceiver(receiver); } catch (Exception ignored) {}
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private String readPayload() {
        return getSharedPreferences(SezaCustomerDisplayPlugin.PREFS, MODE_PRIVATE)
            .getString(SezaCustomerDisplayPlugin.PREF_PAYLOAD, "{}");
    }

    private void render(String payload) {
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
            "main=`<div class='center'><div><div class='mark'>&#10003;</div><div class='message'>Thank you!</div>${Number(p.changeDue||0)>0?`<div class='change'>Change due: ${money(p.changeDue)}</div>`:''}</div></div>`;",
            "}else if(phase==='processing'){",
            "main=`<div class='center'><div><div class='message'>Processing payment&hellip;</div><div class='sub'>${esc(p.statusMessage||'Please wait.')}</div><div class='amount'>${money(p.total)}</div></div></div>`;",
            "}else if(phase==='declined'){",
            "main=`<div class='center'><div><div class='message'>Payment declined</div><div class='sub'>${esc(p.statusMessage||'Please try another payment method.')}</div></div></div>`;",
            "}else if(phase==='cancelled'){",
            "main=`<div class='center'><div><div class='message'>Sale cancelled</div></div></div>`;",
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
