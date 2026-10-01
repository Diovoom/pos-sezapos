# Android merchant-risk continuation — 2026-09-30

Scope: ZIP 38, only the five requested risk areas. No Windows changes, refund work, financial actions, production data repair, deployment, or migrations. This is a partial implementation with an exact plan for the remaining risks, not a claim that all five areas are fixed.

The ZIP 38 baseline `src/lib/offline/sync.ts` matches GitHub main's blob `d69d0365b050b7ac6d160dd82686bf28419db249`. GitHub main was read through the connected repository, Diovoom/pos-sezapos. ZIP 38 remains the baseline for the delivered patch.

## Implemented and tested

| Verified defect | Smallest implemented fix | Exact area |
|---|---|---|
| Two concurrent `syncNow()` calls both pass the lock before the dynamic import resolves. | Acquire the lock before any await; release through the existing finally block. | `src/lib/offline/sync.ts`, `syncNow` |
| Register-open replay upserts `status: open`, reopening an already closed session after a lost acknowledgement. An unrelated uniqueness violation was also accepted. | Insert only; on 23505 read the original ID and compare store, employee, opening timestamp and cash. Preserve later closure. Conflicts remain queued as needs_attention. | Same file, `syncAction`, register_open |
| Register open/close can use a new employee's current auth after the queue's actor check. | Pin both requests and duplicate lookups to the originally captured access token. | Same file, `syncAction` |
| A register close affecting zero visible rows is reported synced. | Scope by original store, request the affected ID, require a returned row. | Same file, register_close |
| Every cash INSERT uniqueness error is treated as already accepted, even for a different payload. | Read original ID under original token/store; compare amount, type, reason, notes, employee, session and idempotency key before acknowledging. Lookup errors retain retry behavior; conflicting/invisible records require attention. | Same file, `syncCashMovement` |
| Shell effect cleanup can run while native initialization awaits, but the abandoned effect then starts heartbeat listeners. | Check the existing effect lifetime flag after native initialization, before starting heartbeat. | `capacitor-shell/main.tsx`, ShellApp startup effect |

These fixes do not require the register to remain open or belong to the same opening employee. Delayed shared-register cash replay remains supported. No queue rows are deleted by the new conflict handling. Original session IDs and employee IDs remain unchanged.

## Tests and limits

- `node scripts/merchant-risk-regression.cjs`: 12/12 passed. Executes the actual TypeScript sync functions against deterministic database/queue boundaries. Covers concurrent entry, lock release, closed register replay, conflicting register identities, successful original-actor insertion, zero-row close, scoped/token-pinned close, identical cash retry, changed-amount collision, invisible collision and temporary failure backoff.
- Before the fix, this harness reproduced overlapping workers, closed-session reopening, unpinned register requests, missing-row close acknowledgement, and cash collision acknowledgement. These are executable reproductions, not production test writes.
- `node scripts/android-lifecycle-regression.cjs`: 2/2 passed. Executes the actual ShellApp effect with delayed initialization; cleanup-before-resolution failed before the fix. Normal startup and cleanup still pass.
- Existing offline identity harness: 3 checks passed against the patched source: foreign merchant/different cashier queue entries remain untouched; an in-flight sale keeps its original token; remaining work pauses on employee switch.
- `npm run typecheck`: passed.
- `npm run android:build`: passed, including the final lifecycle guard.
- `npm run android:verify-native`: passed. This checks bundled transport assets, not a physical reader.
- `git diff --check`: passed.

The new tests use mocked transport and queue boundaries. They do not prove live authenticated RLS execution, physical power-loss durability, or M2 behavior. No new database policy was exercised against production by writing fixtures.

## 1. Cash movement authorization — still open

Live read-only inspection confirms `public.cash_movements_insert` checks only:

```sql
store_id = (select public.current_store_id())
```

The table has separate user, register and store foreign keys; these do not establish that the referenced employee and register belong to the submitted store. `cash_movements_select` and `register_sessions_select` allow current-store reads, supporting the duplicate comparisons in this patch.

Trace: `src/routes/_pos/register.tsx` / `CashMovementDialog` saves original `me.user.id`, `session.id`, `session.store_id`, UUID and idempotency key to IndexedDB before opening the drawer. `src/lib/offline/sync.ts` filters replay by original actor and store and pins the cash INSERT token. Client filtering does not protect direct API INSERTs.

Safest remaining change: a new, narrowly scoped migration replacing only this INSERT policy, with all of these predicates:

1. `user_id = (select auth.uid())`.
2. `store_id = (select public.current_store_id())`.
3. An authoritative employee profile exists for that user and store and is active; apply existing merchant/platform-role exclusion rules without introducing a new permission vocabulary.
4. A `register_sessions` row exists whose ID equals `cash_movements.register_session_id` and whose store equals `cash_movements.store_id`.

Do **not** require `register_sessions.opened_by = auth.uid()`, `status = 'open'`, or `closed_at IS NULL`. Those would break legitimate shared drawers or delayed offline replay. Do not substitute the current register or cashier. Keep safe drops and register-close accounting unchanged.

Database change required; the Android hardening delivered here is complementary. Before migration, run isolated authenticated RLS tests for spoofed user, foreign employee/store/session, null/unknown session, active same-store different opener, closed session replay, disabled employee, and platform roles. Exercise deposit, payout and safe-drop flows and duplicate insert recovery. Apply only after the actual live definitions and migration history are checked again at deployment time. No historical data repair is currently justified by the inspected rows.

## 2. Payment-reference uniqueness — still open

Live indexes inspected on `sale_payments` and `sales` have no uniqueness protection on `sale_payments.provider_reference` or `sales.terminal_ref`. Existing sale UUID/idempotency indexes protect only reuse of the same sale identifier.

Trace:

- `src/routes/_pos/pos.tsx`, finalize mutation: creates a new `saleId` inside each invocation, then uses it for both sale ID and idempotency key.
- `src/components/pos/PaymentDialog.tsx`, approved-card Complete sale callback: invokes completion again without a finalization lock passed from the parent.
- `public.finalize_pos_sale(jsonb,jsonb,jsonb)`, current definition in `supabase/migrations/20260930033719_production_audit_security_integrity.sql`: safely replays an identical sale ID/key before stock checks, but does not claim a processor reference across different sales.
- Single-card allocation can leave `provider` null; `terminal_ref` may also contain display text such as card brand/last4. A naive unique index over all non-null terminal strings or `(provider, reference)` is unsafe/incomplete.

A repeated completion can therefore submit different sale IDs for one approved reference. The code and database guards establish the gap; no duplicate live sale was intentionally created to demonstrate it.

Safest fix, coordinated with area 3: persist one checkout UUID before payment starts; reuse its frozen transaction payload for every finalization/recovery. Atomically claim each actual processor payment using verified provider + environment + connected account + PaymentIntent ID, linked to one sale. Enforce claims across both ledger and header representations, including authenticated direct writes; do not rely only on UI or an RPC lookup. Distinct split-tender PaymentIntents remain valid; cash and display-only references do not become processor claims. Multiple occurrences of the same PI within a split must not count twice.

On an identical retry, return the original same-tenant sale after comparing its canonical request. A different payload/tenant referencing that payment must fail without changing stock or starting a charge. Never reveal another tenant's sale in conflict responses. Add database uniqueness as the final concurrent-write guard, not only an application existence check. Do not merely add an index and leave the current new-sale-ID retry path unchanged.

Requires database + API + Android changes. Tests: parallel same/different IDs; lost commit response; stock now insufficient after the first sale; cross-merchant PI reuse; split cash/card and multiple cards; null provider legacy PI; nonprocessor terminal text; direct INSERT/UPDATE bypass attempts; all rollback paths. Preflight historical references across both tables before creating/backfilling claims. Prior inspection found no duplicate references across distinct sales; do not rewrite financial rows automatically.

## 3. Approved payment without persisted sale — still open

Exact code: `PaymentDialog.tsx` keeps attempt UUID and approved result in React refs/state. `src/lib/hardware/terminal-stripe.ts` / `charge` creates and confirms the PI; the runtime has an in-flight guard and removes its temporary confirmation/abort listeners. After approval it records an audit result, then the separate POS mutation creates the sale.

`src/routes/api/public/pos/stripe-terminal/payment-intent.ts` supplies Stripe idempotency only when the caller supplies the key. `payment-result.ts` retrieves Stripe status with the connected account and updates `payment_attempts`; its audit update error is not checked. `webhook.ts` / `handleEvent` also updates payment attempts for PI events, but neither endpoint has the frozen basket needed to restore the sale. Webhook retries do not by themselves decrement inventory or create a sale in these PI handlers. Event delivery order can still overwrite audit status; an attempt log is not authoritative financial state.

Verified gap: process loss after confirmation destroys the in-memory checkout association; the audit record alone cannot reconstruct the sale. Losing the finalize response also re-enters the fresh-ID problem above. A browser-memory sale key alone would not fix reboot/force-close recovery.

Safest implementation:

1. Persist a checkout intent and frozen basket, tax/pricing, allocations, original employee/store/register and operation UUID before creating any PI. Save the PI mapping durably on the server as well as the device. Do not persist auth secrets/client secrets in the queue.
2. Server recovery retrieves that PI in its recorded connected account/environment and checks actual succeeded status, ownership, currency and amount. Use only the same PI; a database conflict must never call charge creation.
3. Atomically finalize the stored request through the existing inventory transaction and the reference claim from area 2. Preserve original actor attribution with explicit authorization; do not replay as whoever happens to sign in later.
4. Resume unfinished checkouts after launch/auth/network recovery. An unresolved/ambiguous payment blocks a new charge for that checkout until reconciled. Present paid-but-not-saved as a recoverable state, not an invitation to charge again.
5. Webhooks/recovery may drive the same idempotent state machine only when a valid stored checkout exists. Surface audit/database failures rather than treating audit persistence as sale persistence. Reject stale failure events from regressing a verified success.

Tests: kill/offline injection before PI creation, after PI creation, after approval, before/after database commit and before acknowledgement; concurrent webhook/device recovery; employee switch; split tender partly approved; changed stock; missing/revoked auth; missing basket; reordered webhook delivery. Assert one PI, one sale, one inventory decrement and no additional charge for every recovery retry.

The historical $0.50 attempt remains unresolved: its connected-account PI could not be independently retrieved with the available Stripe account context. Platform-account “not found” does not mean the connected-account payment failed. No charge, refund, automatic sale creation, or data repair was performed. Only authenticated read-only retrieval in the correct connected account can establish the next reconciliation step. Do not invent basket or inventory data.

## 4. Remaining offline identity/retry integrity work

Verified retained safeguards: IndexedDB records retain their original actor/store/session; sales and timeclock receive captured tokens; queue filtering rejects another employee/store; dependencies defer sales until register creation; stale syncing recovery and bounded backoff retain failed records. The delivered lock prevents two workers in the same JS runtime from recovering each other's in-flight records. It is not a cross-WebView/process lock.

Remaining traced gaps in `src/lib/offline/sync.ts` / `syncAction`:

- `audit_event` and `catalog_mutation` Supabase writes still use mutable current auth after the actor precheck. Pin those requests and validate original store/payload before writing. Verify all relevant branches with an employee switch during awaited queue updates.
- Catalog delete treats FK error `23503` as success and removes its inventory draft. That is a rejected deletion, not a confirmed cloud change. Preserve it as needs_attention with the database error. Regression: referenced product deletion must remain visible and must not discard its draft.
- `src/lib/email/send.ts` / `sendTransactionalEmail` and `src/lib/sms/send.ts` / `sendSms` reacquire current credentials during receipt replay. Pass an explicit expected actor/store to their authenticated server paths (including native actor proof) and reject mismatch. Do not save long-lived credentials in queued actions. Test switching employee at every auth/transport await plus response-loss idempotency.

These branches were traced but not modified or execution-tested in this patch; they need targeted endpoint/queue tests before implementation. No production repair is justified without inspecting specific affected records. Existing employee_create already passes expectedActorId/expectedStoreId; preserve that guard.

## 5. Listeners and reconnects

Fixed: queue-entry race and late heartbeat startup after effect cleanup, with executable reproductions above.

Verified by code tracing, not physical soak testing: Terminal charge single-flight guard; confirmation/discovery listener removal; connection-token listener promise deduplication; Realtime cleanup in permissions, language, branding, POS inventory and native support components; support interval cleanup. Android lifecycle initialization has a once guard; duplicate resume callbacks clear the background timestamp synchronously before awaited work. No speculative listener rewrite was made.

Remaining scenario to test: `capacitor-shell/lib/deviceHeartbeat.ts` / `startDeviceHeartbeat` uses a shared stopped flag across async startup. A stop/start while the old restore/reconnect work is awaiting may let that old continuation see the new run's false flag. Test with deferred restore/reconnect promises; if reproduced, use a per-start generation/lifetime token and ensure each cleanup removes only its own timers. Do not change the already-working reader reconnect policy without that regression test.

## Delivery and deployment

Changed production files: `src/lib/offline/sync.ts`, `capacitor-shell/main.tsx`.
New files: `scripts/merchant-risk-regression.cjs`, `scripts/android-lifecycle-regression.cjs`, this document.
Database/config changes: **none**. No old migration reapplied. No Stripe settings changed.

Git push is required to publish this patch. Rebuild/install the Android APK to deliver bundled shell fixes; a Git push alone does not update installed APK assets. Shared web sync changes also require the normal web deployment if desired. No APK was signed or installed in this session.

After integration, run both regression scripts, typecheck and `npm run android:sync`. Use the existing Android Studio signed APK workflow/signing key, increasing versionCode when producing an update. Install as an update without uninstalling or clearing app data, so pending offline records survive.

Physical observation after installation: create offline drawer activity under employee A in a shared register, close the session through a permitted flow, reconnect as B and confirm A's queue stays attributed to A; return to A and sync once. Force-close/relaunch during a cash upload and verify one movement and a still-closed session. Observe reconnect/resume during a long-running session. M2 approved-payment/crash tests belong after the payment recovery implementation, in Stripe test mode with test payment credentials; they are not evidence of protection supplied by this patch. Printer/customer display behavior was unchanged and was not hardware-tested.
