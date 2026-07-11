## Feature: Cash Drawer Control + Cashier Shift Review

One connected workflow. Reuses existing `register_sessions`, `cash_movements`, `audit_log`, `openCashDrawer` bridge, `ManagerOverrideDialog`, `fetchShiftSummary`, and `/shifts` owner page. No parallel shift system.

---

### 1. Database — smallest necessary migration

Extend existing tables; no new tables.

**`register_sessions`** — add closing snapshot columns:
- `safe_drop_amount numeric default 0`
- `denominations jsonb` (per-denom counts if used)
- `approver_id uuid references auth.users`
- `close_notes text`

**`cash_movements`** — extend `type` check to include `safe_drop`; keep `deposit`/`payout`. Safe drops are recorded as `cash_movements` (type=`safe_drop`) linked to `register_session_id`, so expected-cash math already picks them up.

**Reuse `audit_log`** for `NO_SALE_DRAWER_OPEN` events. Action string `drawer.no_sale_open`; `entity='register_session'`; `entity_id=session.id`; `details` jsonb holds: `{ reason, note, register_id, cashier_id, status: 'requested'|'unavailable'|'opened'|'failed', drawer_simulated, safe_drop_amount, approver_id, approver_name, client_dedupe_id }`. `audit_log` already scopes to store and blocks user deletes (no DELETE policy for authenticated) — immutable per spec.

Server-side idempotency: RPC `close_register_session(session_id, payload)` — `UPDATE ... WHERE id=? AND status='open'` returning the row; second call returns nothing → treated as no-op. Same guard on safe-drop insert via `client_dedupe_id` unique per session.

---

### 2. Open Cash Drawer button (desktop + mobile)

**Desktop** — `src/components/pos/PosShell.tsx` left checkout panel, above the cashier-name row / divider, only when active cashier + open register. Cash-drawer icon (`DoorOpen`), full-width outline button. Not in overflow menu, not with payment buttons.

**Mobile** — same shell, add row inside the existing mobile Sheet menu (already there from prior slice), only when register is open. Verified at 375px.

Both open the same `<OpenDrawerDialog />`.

---

### 3. Open Drawer dialog

New component `src/components/pos/OpenDrawerDialog.tsx`. Radio group:
- Make Change
- Count Shift
- Cash Pickup / Safe Drop  → reveals amount input, optional note
- Manager Request           → triggers `ManagerOverrideDialog` (existing)
- Other                     → note required

Buttons: Cancel · Request Drawer Open. Submit button disabled during pending mutation to block double-click; also debounced via `client_dedupe_id` (uuid generated per dialog-open).

Confirmed submit flow:
1. Insert one `audit_log` row (`drawer.no_sale_open`, status=`requested`).
2. If reason = Cash Pickup/Safe Drop → also insert a `cash_movements` row (`type=safe_drop`, `amount`, `reason='Safe drop'`) — same `client_dedupe_id` guards duplicates.
3. If reason = Manager Request → require `ManagerOverrideDialog` PIN first; store approver id/name in details.
4. Call `openCashDrawer(reason)` (existing bridge). If `getDevice('drawer') || getDevice('printer')` is missing → treat as unavailable: update audit row `details.status='unavailable'`, toast: "Cash drawer unavailable. Connect a supported register bridge or receipt printer." No fake success. If bridge present → update to `opened`.

No sale/refund/payment side-effects.

Opening with no active shift → forces `ManagerOverrideDialog` before recording the event.

PINs never logged (audit `details` never includes PIN; existing `ManagerOverrideDialog` already returns only `manager_id`/`manager_name`).

---

### 4. Cashier Shift page (reuse existing `/register`)

`src/routes/_pos/register.tsx` — extend the `OpenSessionCard` header block, no new route:
- Cashier name, register name, status badge, opening date/time, opening cash (already shown)
- Add: time worked (live from `opened_at`)
- Sales summary (already there)
- No-sale drawer-opening count (count from `audit_log` where action=`drawer.no_sale_open` for this session)
- Safe drops list + total (from `cash_movements` type=`safe_drop`)
- Replace/rename "Close Register" primary CTA to **Review & Close Shift** → opens stepped dialog

Mobile: convert the 6-col stat grid to 2-col at `<sm`, stack action buttons. Same page at all breakpoints — no duplicate.

---

### 5. Review & Close Shift — stepped dialog

New `src/components/pos/CloseShiftDialog.tsx` with 5 stepper panels; shares the same expected-cash formula.

**Step 1 — Activity:** completed sales count, gross, discounts, refunds, voids, cash sales, card sales, other, no-sale count, safe drops. Reuse `fetchShiftSummary`.

**Step 2 — Count cash:** toggle between "Enter total" and "Count by denomination" ($100/$50/$20/$10/$5/$1/25¢/10¢/5¢/1¢). Denom sum auto-fills total. Expected cash hidden here unless store setting `show_expected_before_count` is on (store-level pref stored in existing `stores` settings jsonb — no schema change needed if column exists; otherwise store in existing `pos:prefs:register` localStorage mirror + a boolean column already available via settings screen. **If no suitable existing column, add `show_expected_before_count boolean default false` to `stores`.**)

**Step 3 — Variance (server-computed):** on advance, call server fn `computeShiftClose({ sessionId, countedCash })` returning `{ expected, counted, variance, status: over|short|balanced }`. Formula:

```
expected = opening_cash
         + sum(sales.total where payment_method='cash' AND status='completed')
         + sum(cash_movements.amount where type='deposit')
         - sum(refunds.total where payment_method='cash' AND status='completed')
         - sum(cash_movements.amount where type IN ('payout','safe_drop'))
```

Card/other excluded. Count is not mutated.

**Step 4 — Safe drop:** suggested = `counted - store.starting_cash_float`; input clamped `0 ≤ amount ≤ counted`; shows remaining. Copy: "Place the removed cash and shift report in the assigned cash bag or envelope, then secure it in the safe." Saved as `cash_movements(type=safe_drop)` with `client_dedupe_id`.

**Step 5 — Final review + close:** shows all figures, mandatory checkbox "I confirm that I counted the drawer and secured the removed cash." Final button "Close Shift & Sign Out". Excess variance → `ManagerOverrideDialog` first; approver_id stored on session; cashier cannot self-approve unless they hold owner/admin/manager role (existing `usePermissions().isSuper` check).

On submit: server RPC `close_register_session` (single UPDATE with `WHERE status='open'`), then `supabase.auth.signOut()`, navigate `/auth?mode=pin`. Button disabled while pending → no double-close, no duplicate safe-drop.

---

### 6. Owner review — extend `/shifts`

`src/routes/_dashboard/shifts.tsx` + `src/components/reports/ShiftSummaryReport.tsx`:
- Session detail drawer already exists; add rows: safe drops list, no-sale drawer-opening count with expandable reason/note/approver list (queried from `audit_log`), approver info, close notes, cash remaining.
- Print/PDF path already in `ShiftSummaryReport` — new rows print through automatically.
- No new route.

Immutability: `register_sessions` UPDATE policy stays; adjustments must be new audit rows (out of scope beyond preserving current no-DELETE stance).

---

### 7. Files to change

- `supabase/migrations/*` — new migration (columns + type check + optional `show_expected_before_count`)
- `src/components/pos/PosShell.tsx` — desktop button placement + mobile Sheet row
- `src/components/pos/OpenDrawerDialog.tsx` — new
- `src/components/pos/CloseShiftDialog.tsx` — new (stepper)
- `src/lib/pos/shift-close.functions.ts` — new server fns: `computeShiftClose`, `closeRegisterSession` (requireSupabaseAuth; atomic UPDATE with status guard)
- `src/lib/pos/drawer-events.ts` — new tiny helper: `recordNoSaleOpen({...})` wraps audit insert + optional cash_movement, dedupes by `client_dedupe_id`
- `src/routes/_pos/register.tsx` — swap inline close UI to `CloseShiftDialog`, add no-sale count + safe-drop list + time worked; mobile grid tweaks
- `src/routes/_dashboard/shifts.tsx` — surface no-sale list, safe drops, approver in existing drawer
- `src/components/reports/ShiftSummaryReport.tsx` — render new fields (safe drops, no-sale count, approver, cash remaining)

### 8. Test matrix (all 19 spec tests)

Manual pass on desktop + 375px mobile after build: button placement, reason dialog, single audit event per confirm, unavailable state (no hardware), Count Shift → review dialog, mobile stepper usable, expected formula excludes card, cash refunds + safe drops reduce expected, denom + manual counting, over/short/balanced, excess-variance approval, safe-drop clamp, no-sale in owner report, double-click idempotency (dialog disable + server WHERE guard + dedupe id), sign-out on close, `/shifts` visibility, historical sales untouched.
