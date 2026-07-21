# Live Screen Viewing for the SEZA POS Android APK

Replace the "android_diagnostics_only" capability with a real, view-only MediaProjection + WebRTC pipeline. All existing approval, `channel_token` signaling, RLS, audit, and device-pairing flows stay intact — we only swap the merchant-side stream source and lift the admin gating.

## Architecture

```text
Merchant APK                                                Admin browser
────────────                                                ─────────────
[Accept dialog] ──► SezaScreenCapture (native)              AdminScreenViewer
     │                 ├─ MediaProjection (foreground svc)  (unchanged; sees
     │                 ├─ VirtualDisplay → Surface           video track)
     │                 └─ H264 encoded frames               ▲
     ▼                        │                              │
NativeRTCPeer (TS wrapper) ◄──┘   RTCPeerConnection ─────► WebRTC (P2P media)
     │                                        ▲
     └── signaling ─── Supabase Realtime broadcast (channel_token) ─┘
```

Signaling stays on the existing `support-rtc-<channel_token>` Realtime channel. Media goes P2P via WebRTC with the current STUN config (`src/lib/support/webrtc.ts`).

## New Android Capacitor plugin: `SezaScreenCapture`

Location: `android/app/src/main/java/com/sezapos/screen/`

- `SezaScreenCapturePlugin.java` — `@CapacitorPlugin` exposing:
  - `requestPermission()` → launches system MediaProjection consent intent, resolves `{ granted }`.
  - `start({ maxWidth, maxFps, bitrateKbps })` → starts foreground service, begins encoding.
  - `stop()` → tears down encoder, projection, and service.
  - Emits events: `frame` (H.264 NAL byte[] via base64), `state` (`starting|active|paused|stopped`), `error`.
- `ScreenCaptureService.java` — `Service` with `FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION`; shows the persistent Android notification "SEZA Support is viewing your screen — Tap to stop" that also stops the session on tap.
- `H264Encoder.java` — `MediaCodec` (`video/avc`) fed by a `VirtualDisplay` → `Surface`. Adaptive bitrate (200–1500 kbps), keyframe every 2 s, 20–30 FPS target, drops to 10 FPS on backpressure.
- Register the plugin in `MainActivity.java`.

`AndroidManifest.xml` additions:
- `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`
- `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />`
- `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
- `<service android:name=".screen.ScreenCaptureService" android:foregroundServiceType="mediaProjection" android:exported="false" />`
- Target SDK bump reviewed to ≥34 for the new mediaProjection foreground-service type (only if not already).

## TS bridge: `capacitor-shell/support/nativeScreenCapture.ts`

Wraps `registerPlugin<SezaScreenCapturePlugin>('SezaScreenCapture')`. Exposes an async iterator of H.264 NAL units plus start/stop. On non-Android hosts, throws so we fall back to `getDisplayMedia`.

## WebRTC merchant peer (new): `capacitor-shell/support/AndroidScreenShare.tsx`

Replaces the diagnostics-only path in `capacitor-shell/support/SupportRequestListener.tsx`:

- Requests MediaProjection consent (`requestPermission()`) BEFORE calling `postSupport("support-respond", { decision: "accept", clientCapability: "android_screen_share" })`. Decline path unchanged.
- Builds `RTCPeerConnection` (reuses `RTC_CONFIG` from `src/lib/support/webrtc.ts`) and creates a single video sender fed by an `RTCRtpSender` with `insertableStreams` receiving encoded H.264 NALs from the plugin (WebCodecs `EncodedVideoChunk` path — WebView on Android 14+ supports encoded transforms). If unavailable, fall back to publishing via a `MediaStreamTrackGenerator`.
- Uses `openSignalingChannel(supabase, channelToken, …)` — identical to the web merchant peer.
- Lifecycle hooks (via existing `androidLifecycle.ts`): pause encoder on background, resume on foreground; auto-reconnect signaling with exponential backoff (max 5 attempts, 30 s cap); hard-stop on merchant sign-out, device unregister, ticket close, session expiry, or 60 s network timeout.
- Persistent compact banner (top-of-screen, ~40 px): red dot, "Screen Sharing Active · SEZA Support · mm:ss · Stop Sharing". POS layout untouched — banner slides in above `AppShell`.

## Admin side changes

- `src/lib/admin/admin.functions.ts`: extend the `clientCapability` union to include `"android_screen_share"` in `merchantRespondSupportSession` input, in `adminOpenSupportSession` output, and in stored `client_capability` (validated in `src/routes/api/public/pos/support-respond.ts` too).
- `src/routes/_adminApp/route.tsx` (line ~343): drop the diagnostics-only branch and render `AdminScreenViewer` for both `web_screen_share` and `android_screen_share`.
- `src/components/support/AdminScreenViewer.tsx`: unchanged transport; add small badge showing capability ("Android live view") plus existing FPS/bitrate/latency/quality readouts already sampled via `sampleQuality`. Keep End Session, Pause/Resume (Pause = `receiver.track.enabled = false`, no signal to merchant beyond quality drop). Screenshot button gated behind a separate merchant-approved event — deferred (out of scope for this pass; explicitly not added to avoid silent capture).
- `src/components/support/AdminDiagnosticsPanel.tsx`: remove the "Live screen viewing is not available for the Android APK" copy; keep the diagnostics tab as a supplementary panel.

## Server / DB

No schema change. `client_capability` already `text`; we simply add `"android_screen_share"` as an accepted value in server-side validators:
- `src/routes/api/public/pos/support-respond.ts`
- `src/lib/admin/admin.functions.ts` (`merchantRespondSupportSession`)

## Audit events

Extend `src/lib/audit-log.ts` calls emitted from `SupportRequestListener` and admin session functions to include:
- `support.session.requested` (already)
- `support.session.approved` / `declined` with `client_capability`
- `support.stream.started` (new — fired after first ICE `connected`)
- `support.stream.stopped` with `reason` in `{ merchant_stopped, admin_ended, ticket_closed, signed_out, device_unregistered, session_expired, network_timeout, app_closed }`
- `support.stream.paused_background` / `resumed_foreground`

Each includes correlation id (= `session.id`), `store_id`, `register_id` (if any), `employee_id`, `admin_id`, duration_ms.

## Security & privacy invariants (unchanged / reinforced)

- MediaProjection consent required per session (Android enforces).
- Foreground-service notification is non-dismissible and stops session on tap.
- Banner always visible while active; no background streaming — encoder pauses when app is not resumed.
- Signaling still keyed by unguessable `channel_token`.
- No DataChannel is created on either peer (already true for admin) — enforces view-only.
- Nothing new logged that could contain PII: no frames written to disk, no clipboard/mic/camera access, no screenshots server-side.

## Files changed / added

Added:
- `android/app/src/main/java/com/sezapos/screen/SezaScreenCapturePlugin.java`
- `android/app/src/main/java/com/sezapos/screen/ScreenCaptureService.java`
- `android/app/src/main/java/com/sezapos/screen/H264Encoder.java`
- `capacitor-shell/support/nativeScreenCapture.ts`
- `capacitor-shell/support/AndroidScreenShare.tsx`

Edited:
- `android/app/src/main/AndroidManifest.xml` (permissions + service)
- `android/app/src/main/java/com/sezapos/app/MainActivity.java` (register plugin)
- `android/app/build.gradle` (targetSdk review if needed)
- `capacitor-shell/support/SupportRequestListener.tsx` (swap diagnostics path for `AndroidScreenShare`, request MediaProjection consent before accept)
- `src/lib/admin/admin.functions.ts` (accept `android_screen_share`)
- `src/routes/api/public/pos/support-respond.ts` (validator)
- `src/routes/_adminApp/route.tsx` (render viewer for android capability)
- `src/components/support/AdminScreenViewer.tsx` (capability badge)
- `src/components/support/AdminDiagnosticsPanel.tsx` (remove "not available" copy)
- `src/lib/audit-log.ts` (new event constants)

## Testing plan

Web build + typecheck (`bun run build`, `tsgo --noEmit`), then `bun run android:build` and manual Android device pass covering: approval required, decline, stop-sharing, admin end, POS remains usable, orientation change, background/foreground pause+resume, network drop reconnect, session expiry, low-bandwidth adaptive bitrate, no orphan sessions after force-quit.

## Notes / risks

- WebRTC inside the Android WebView requires piping encoded H.264 to the peer connection. Preferred path: WebCodecs `MediaStreamTrackGenerator` + `EncodedVideoChunk`. If the shipped WebView version doesn't expose it, plugin will decode-then-recompose using `VideoFrame` from the encoded stream (slightly higher CPU). Both paths are view-only and covered by MediaProjection consent — decision made at plugin init based on `window.MediaStreamTrackGenerator` feature detection.
- Screenshot-on-admin-side intentionally deferred: it requires a second merchant approval channel and belongs in a follow-up to keep this change scoped to live viewing.
