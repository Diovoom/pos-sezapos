# SEZA POS Homepage Polish — July 22, 2026

This package contains the updated SEZA POS source project with a redesigned public website. The POS, owner dashboard, admin portal, Supabase schema, Stripe backend logic, and Android application workflows were not intentionally rebuilt by this update.

## What changed

- Rebuilt the public homepage with a smaller centered SEZA mark, moving “Smart POS. Better business.” messaging, product screenshots, real capability sections, industries, pricing, FAQs, and polished calls to action.
- Replaced the basic mobile hamburger with an animated circular menu that changes into an X.
- Added a hardware-planning section and hardware page without claiming that hardware bundles are already available.
- Added transparent Stripe wording: Stripe handles SEZA subscription billing; Stripe Terminal workflows require the proper merchant, reader, key, and Android configuration.
- Added a working cookie consent banner and preference center. Optional analytics and marketing preferences start disabled.
- Reworked the Terms, Privacy Policy, Cookie Policy, Refund Policy, Acceptable Use Policy, Security Policy, Accessibility Statement, DMCA information, and related legal pages.
- Updated SEZA logo, favicons, app icons, and the public social-sharing image.
- Removed unsupported security, uptime, refund, response-time, backup, certification, and merchant-of-record claims from the edited public pages.
- Preserved the footer wording: © SEZA Technologies. All rights reserved.

## Safe merge instructions

1. Back up your current `pos-sezapos-main` folder.
2. Unzip this package.
3. Copy the included `pos-sezapos-main` folder over your current project folder and allow matching source files to be replaced.
4. Keep your existing `.env`, `.env.development`, and `.env.production` files. They are intentionally excluded from this ZIP.
5. Open the merged project in VS Code.
6. Run:

```bash
npm install
npm run build
```

7. Review the homepage locally, then commit and push the changes to the GitHub branch connected to Lovable.

## Git commands

```bash
git status
git add .
git commit -m "Polish SEZA public homepage and legal pages"
git push
```

## Validation completed before packaging

- All 282 TypeScript and TSX files passed a TypeScript syntax/transpile check.
- Updated images were generated and visually inspected.
- The final ZIP was integrity-tested after creation.

A complete Vite production build could not be run inside the packaging environment because its npm package registry was returning HTTP 503 errors. Run `npm install` and `npm run build` on your computer before publishing.
