# SEZA POS Release Test Checklist

Record the tester, date, device model, Android version, store, database project, printer/scanner/reader models, and build SHA before testing.

## A. Installation and release identity

- [ ] Clean install Android build 8.
- [ ] Upgrade from the previous APK without clearing data.
- [ ] App shows version 1.3.2/build 8 where version is displayed.
- [ ] Website, dashboard, POS, and admin deploy from the same source revision.
- [ ] No nested `SEZA-POS-v*-PRODUCTION-PATCH` or second project root remains.
- [ ] No `.env`, signing secret, APK, or generated output is tracked by Git.
- [ ] `npm run verify:production` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run lint` passes.
- [ ] Hosted website build passes.
- [ ] Capacitor build/sync passes.
- [ ] Gradle debug APK build passes.

## B. Database

- [ ] All earlier and patch migrations show applied in order.
- [ ] `finalize_pos_sale` exists.
- [ ] `record_legal_acceptance` exists.
- [ ] Tenant-scoped `has_permission` exists.
- [ ] Support columns exist.
- [ ] Platform `global` settings row exists.
- [ ] Support tickets and notes are in realtime publication.
- [ ] `public_api_rate_limits` and `consume_public_rate_limit` exist.
- [ ] A database backup/restore point exists.

## C. Authentication, pairing, and security

- [ ] Owner login succeeds.
- [ ] Cashier login succeeds.
- [ ] Expired/invalid session is rejected clearly.
- [ ] Device pairing succeeds and survives app restart.
- [ ] Upgrade migrates legacy pairing once and removes it from WebView localStorage.
- [ ] Clearing pairing requires a deliberate re-pair.
- [ ] Cashier cannot open employee-PIN management.
- [ ] Cashier calling the PIN endpoint receives 403.
- [ ] Manager/owner can set a strong unique six-digit PIN.
- [ ] Weak PIN is rejected.
- [ ] Duplicate active-store PIN is rejected.
- [ ] PIN set and clear appear in audit history.
- [ ] Android backup is disabled in the built manifest.

## D. Online cash checkout

- [ ] Add one product and complete a cash sale.
- [ ] Add multiple products and quantities.
- [ ] Complete a custom-item sale as authorized management.
- [ ] Apply percent discount.
- [ ] Apply fixed discount.
- [ ] Confirm tax and total math.
- [ ] Enter exact cash.
- [ ] Enter excess tender and confirm change.
- [ ] Receipt appears immediately.
- [ ] Cart clears only after durable completion.
- [ ] Sale header, items, payment, and inventory all exist.
- [ ] Repeating the same idempotency key does not duplicate the sale.
- [ ] Two terminals selling the last tracked unit cannot both succeed.
- [ ] Insufficient inventory produces a useful error and no partial sale.
- [ ] Register session is linked when open.
- [ ] Audit row contains actor and store.

## E. Card and split checkout

- [ ] No connected provider never displays a fake approval.
- [ ] Approved card result creates one complete sale.
- [ ] Declined card creates no completed sale.
- [ ] Cancelled/timeout result creates no completed sale.
- [ ] Split cash/card allocation equals sale total.
- [ ] Payment ledger records provider/reference without full card data.
- [ ] Card checkout is blocked offline.

## F. Offline cash checkout

- [ ] Sign in online once, then enable airplane mode.
- [ ] Cached products, prices, taxes, permissions, and store load.
- [ ] Cached product images remain after killing and reopening the app offline.
- [ ] Complete an offline cash sale.
- [ ] Receipt appears immediately while offline.
- [ ] Cart clears immediately.
- [ ] Create two rapid sales; local receipt sequences are unique.
- [ ] Kill the app immediately after a sale; sale remains in Pending Sync.
- [ ] Reboot the device; sale remains.
- [ ] Pending Sync shows the sale, cash queue, and action queue counts.
- [ ] Reconnect and confirm one server sale only.
- [ ] Inventory decrements once only.
- [ ] Temporary failure backs off and retries.
- [ ] Permanent/RLS/migration failure becomes Needs Attention.
- [ ] Retry from Pending Sync works after the root cause is corrected.

## G. Offline register, shift, and drawer ordering

- [ ] Open a register offline.
- [ ] Complete sales against the local register.
- [ ] Record payout/safe drop/no-sale offline where permitted.
- [ ] Close shift offline.
- [ ] Reconnect and confirm register open syncs first.
- [ ] Sales and cash movements do not attempt before register open succeeds.
- [ ] Customer receipts do not send before the referenced sale syncs.
- [ ] Register close remains pending until every shift record is synced.
- [ ] Shift totals and variance match local records.
- [ ] App kill during `syncing` recovers the record on next launch.

## H. Store reassignment safety

- [ ] Create at least one unsynced sale.
- [ ] Attempt to pair/switch to another store.
- [ ] Checkout is hard-blocked.
- [ ] Pending Sync shows previous/requested store and preserved count.
- [ ] Unsynced sale, movement, and action records remain intact.
- [ ] After all records sync, store change succeeds.
- [ ] Products/categories from the previous store are not shown in the new store.

## I. Product catalog and Android UI

- [ ] Favorites tab scrolls to its last product.
- [ ] All tab scrolls to its last product.
- [ ] Bottom navigation never covers product cards or checkout controls.
- [ ] Product image displays online.
- [ ] Image displays after app restart offline.
- [ ] Missing/broken image shows a clean placeholder.
- [ ] Search by name works.
- [ ] Search by SKU works.
- [ ] Barcode/HID entry works.
- [ ] Android back button closes dialogs before leaving checkout.
- [ ] Loading, empty, network-error, and retry states are understandable.

## J. Receipts and messaging

- [ ] Printed receipt totals and transaction ID match database.
- [ ] Reprint works.
- [ ] Email online says Sent only after server acceptance.
- [ ] Email offline says Queued, not Sent.
- [ ] SMS online says Sent or Already sent accurately.
- [ ] SMS offline says Queued.
- [ ] Repeated recipient/idempotency request does not duplicate delivery.
- [ ] Provider/configuration error is visible to operator.
- [ ] Queued receipt resumes after reconnect.

## K. Printer, drawer, scanner, display, and payments

- [ ] Pair the exact receipt-printer model.
- [ ] Test 58mm output if supported.
- [ ] Test 80mm output if supported.
- [ ] Printer disconnect reports failure—not success.
- [ ] Cash drawer opens after configured cash sale.
- [ ] No-sale/payout requires reason/permission as designed.
- [ ] Drawer disconnected reports failure—not success.
- [ ] USB/Bluetooth HID scanner works repeatedly.
- [ ] No camera-scanner permission or ML Kit barcode dependency is present in the dedicated APK.
- [ ] Customer display shows correct line items/total if enabled.
- [ ] Stripe reader/Tap to Pay uses production-approved SDK and account.

## L. Time clock and employees

- [ ] Clock in online.
- [ ] Start/end break online.
- [ ] Clock out online.
- [ ] Repeat the four actions offline.
- [ ] Reconnect; actions sync in order and do not duplicate.
- [ ] Cashier cannot access protected owner/manager controls.
- [ ] Manager override records reason and actor.

## M. Support and Admin

- [ ] Merchant creates a ticket with subject and details.
- [ ] Admin Open Case navigation works.
- [ ] Admin claims ticket.
- [ ] Claim records assignee/time and activates chat.
- [ ] Merchant/admin messages update in realtime.
- [ ] Internal notes stay hidden from merchant.
- [ ] Investigating state remains active.
- [ ] Waiting for merchant remains active.
- [ ] Resolve requires a meaningful summary.
- [ ] Resolved ticket chat ends and priority becomes normal.
- [ ] Close is allowed only after resolution.
- [ ] Reopen clears chat-end metadata and activates chat.
- [ ] Persistent admin chat survives admin navigation.
- [ ] New-message notification opens the correct conversation.
- [ ] Maintenance mode notice appears to merchant owners.
- [ ] Merchant banner appears and can be cleared.
- [ ] Audit entries contain actor, store, action, entity, and timestamp.

## N. Website, language, and legal

- [ ] Homepage has no fake Shop now checkout.
- [ ] Hardware page clearly presents compatibility guidance.
- [ ] Terms link opens the real Terms document.
- [ ] Privacy link opens the real Privacy document.
- [ ] Signup metadata includes policy versions/timestamp.
- [ ] Completing setup creates one immutable legal-acceptance row.
- [ ] English navigation, pricing, FAQ, and footer are complete.
- [ ] Each supported language changes complete known strings.
- [ ] No word is corrupted by partial replacement (test `Modifier`).
- [ ] Brand names, product names, URLs, IDs, and merchant text remain unchanged.
- [ ] Missing translations remain a complete English sentence.
- [ ] Language persists across navigation/reload.
- [ ] Mobile, tablet, and desktop layouts have no clipped controls.
- [ ] Terms, Privacy, support, status, and contact links return valid pages.

## O. Screen sharing and diagnostics

- [ ] Android media-projection consent appears.
- [ ] Foreground-service notification appears when required.
- [ ] Screen stream starts on a real supported device.
- [ ] Stopping from app and system notification works.
- [ ] Denied permission is handled clearly.
- [ ] App/background/process-kill behavior is recorded.
- [ ] Device logs contain no pairing secret, PIN, or card data.

## Release sign-off

- [ ] No P0 or P1 failure remains.
- [ ] Every failed checklist item has an owner and ticket.
- [ ] Production database backup is confirmed.
- [ ] Signed release build comes from the tested source revision.
- [ ] One pilot merchant/register completes a controlled live shift before broad rollout.
