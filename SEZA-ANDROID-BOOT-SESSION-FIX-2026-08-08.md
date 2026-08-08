# SEZA Android boot/session fix — 2026-08-08

Implemented in the bundled Capacitor Android shell:

- Branded startup screen now remains active through the first local employee/store/clock/register/catalog/cart reads.
- Current employee identity marker is written after PIN authentication and cleared on switch/shift teardown.
- Employee-scoped clock/register/cart state remains isolated by user id.
- Register-screen shift close now clocks the employee out locally before print/sign-out, matching Time Clock behavior.
- Register close remains idempotent and queues cloud synchronization after local completion.
- Legacy customer-display Activity source and customer-display shell route were removed; Android Presentation is the only native secondary-display path.
- Presentation remains NOT_TOUCHABLE and NOT_FOCUSABLE so the cashier display keeps input focus.
- Receipt reference sanitization and compact cashier-name formatting remain enabled for both rendered and native printed receipts.

Validation performed:

- Source checks passed for Presentation-only display routing, non-touch/focus flags, local boot reads, identity clearing, and register-close clock-out.
- Full npm build could not be executed in this environment because the configured npm registry returned 404 for `zod-to-json-schema@3.25.2` during `npm ci`. The original lockfile was not modified.
