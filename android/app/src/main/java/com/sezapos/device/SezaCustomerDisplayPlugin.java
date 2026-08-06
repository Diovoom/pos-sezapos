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

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SezaCustomerDisplay")
public class SezaCustomerDisplayPlugin extends Plugin implements DisplayManager.DisplayListener {
    private CustomerPresentation presentation;
    private int activeDisplayId = -1;
    private String lastPayload = "{}";
    private String storeName = "SEZA POS";
    private DisplayManager displayManager;

    @Override public void load() {
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        displayManager.registerDisplayListener(this, null);
    }

    @PluginMethod public void listDisplays(PluginCall call) {
        JSArray rows = new JSArray();
        int primary = primaryDisplayId();
        for (Display display : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (display.getDisplayId() == primary) continue;
            JSObject row = new JSObject();
            row.put("displayId", display.getDisplayId()); row.put("name", display.getName());
            row.put("state", display.getState()); row.put("valid", display.isValid());
            row.put("active", presentation != null && activeDisplayId == display.getDisplayId());
            rows.put(row);
        }
        JSObject result = new JSObject(); result.put("displays", rows); result.put("activeDisplayId", activeDisplayId); call.resolve(result);
    }

    @PluginMethod public void start(PluginCall call) {
        int requestedId = call.getInt("displayId", -1);
        storeName = call.getString("storeName", "SEZA POS");
        Display chosen = findSecondary(requestedId);
        if (chosen == null) { call.reject("No secondary customer display was detected"); return; }
        final Display display = chosen;
        getActivity().runOnUiThread(() -> {
            try {
                stopPresentation();
                presentation = new CustomerPresentation(getContext(), display, storeName);
                presentation.show(); activeDisplayId = display.getDisplayId(); presentation.render(lastPayload);
                JSObject result = new JSObject(); result.put("started", true); result.put("displayId", activeDisplayId); call.resolve(result);
            } catch (Exception e) { stopPresentation(); call.reject("Could not start customer display: " + e.getMessage(), e); }
        });
    }

    @PluginMethod public void update(PluginCall call) {
        lastPayload = call.getString("payload", "{}");
        getActivity().runOnUiThread(() -> { if (presentation != null && presentation.isShowing()) presentation.render(lastPayload); call.resolve(); });
    }

    @PluginMethod public void stop(PluginCall call) { getActivity().runOnUiThread(() -> { stopPresentation(); call.resolve(); }); }
    @PluginMethod public void status(PluginCall call) { JSObject r=new JSObject(); r.put("running",presentation!=null&&presentation.isShowing()); r.put("displayId",activeDisplayId); call.resolve(r); }

    private int primaryDisplayId() { return getActivity()!=null && getActivity().getDisplay()!=null ? getActivity().getDisplay().getDisplayId() : Display.DEFAULT_DISPLAY; }
    private Display findSecondary(int requestedId) {
        for (Display d: displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) if (d.getDisplayId()!=primaryDisplayId() && d.isValid() && (requestedId<0 || d.getDisplayId()==requestedId)) return d;
        return null;
    }
    private void stopPresentation(){ if(presentation!=null){try{presentation.dismiss();}catch(Exception ignored){} presentation=null;} activeDisplayId=-1; }
    @Override protected void handleOnDestroy(){ if(displayManager!=null)displayManager.unregisterDisplayListener(this); stopPresentation(); super.handleOnDestroy(); }
    @Override public void onDisplayAdded(int id) {}
    @Override public void onDisplayChanged(int id) {}
    @Override public void onDisplayRemoved(int id) { if(id==activeDisplayId)getActivity().runOnUiThread(this::stopPresentation); }

    private static class CustomerPresentation extends Presentation {
        private WebView webView;
        CustomerPresentation(Context context, Display display, String storeName){ super(context,display); }
        @Override protected void onCreate(Bundle b){ super.onCreate(b); requestWindowFeature(Window.FEATURE_NO_TITLE); Window w=getWindow(); if(w!=null){w.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);} webView=new WebView(getContext()); WebSettings s=webView.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(false); webView.setBackgroundColor(0xfff8fafc); setContentView(webView); webView.loadDataWithBaseURL(null,html(),"text/html","UTF-8",null); }
        void render(String payload){ if(webView==null)return; final String safe=android.util.Base64.encodeToString(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8),android.util.Base64.NO_WRAP); webView.evaluateJavascript("window.SEZA_RENDER(atob('"+safe+"'))",null); }
        private String html(){ return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a}.wrap{height:100vh;display:grid;grid-template-rows:auto 1fr auto}.head{padding:24px 32px;border-bottom:1px solid #e2e8f0;font-size:26px;font-weight:800}.items{padding:24px 32px;overflow:auto}.row{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid #e2e8f0;font-size:22px}.muted{color:#64748b;font-size:16px}.foot{padding:22px 32px;background:white;border-top:1px solid #e2e8f0}.sum{display:flex;justify-content:space-between;font-size:20px;margin:8px 0}.total{font-size:34px;font-weight:900;color:#1d4ed8}.status{text-align:center;font-size:30px;font-weight:800;padding:30px}</style></head><body><div id='app'></div><script>window.SEZA_RENDER=function(raw){let p={};try{p=JSON.parse(raw)}catch(e){};let lines=(p.lines||[]).map(x=>`<div class='row'><div><b>${esc(x.name)}</b><div class='muted'>${x.qty} × ${money(x.unitPrice)}</div></div><b>${money(x.lineTotal)}</b></div>`).join('');let status=p.statusMessage||({idle:'Welcome',processing:'Processing payment…',complete:'Payment approved',declined:'Payment declined',cancelled:'Transaction cancelled'}[p.phase]||'');document.getElementById('app').innerHTML=`<div class='wrap'><div class='head'>${esc(p.storeName||'SEZA POS')}</div><div class='items'>${lines||`<div class='status'>${esc(status||'Ready for your order')}</div>`}</div><div class='foot'>${status?`<div class='status'>${esc(status)}</div>`:''}<div class='sum'><span>Subtotal</span><b>${money(p.subtotal)}</b></div><div class='sum'><span>Tax</span><b>${money(p.tax)}</b></div><div class='sum total'><span>Total</span><span>${money(p.total)}</span></div></div></div>`};function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))}function esc(v){return String(v||'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]))}</script></body></html>"; }
    }
}
