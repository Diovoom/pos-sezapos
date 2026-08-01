# SEZA Owner Dashboard web update

Website/owner dashboard only. No Android APK or platform-admin files were changed.

## Included

- Every Daily Summary card is interactive.
- Best Seller opens a ranked first/second/third product list with quantity and revenue.
- Items Sold opens the complete ranked item breakdown.
- Transactions, cash, card, tax, refunds, discounts, net revenue, and employee cards open useful daily details.
- Busiest Hour opens a full 24-hour transaction scale/chart.
- Corrected Items Sold to total quantities instead of counting only sale-item rows.
- Added a dedicated My Profile page with employee ID, masked PIN status, role, store, email, phone, hire date, schedule, account creation date, and security shortcuts.
- Products removed from the More menu.
- Products icon added directly beside Publish in mobile and desktop headers.
- Fixed an accidental duplicate return statement in Business Settings.

## Install

Copy the included `src` folders over the project root and replace the matching files.

Run from the project root:

```powershell
npm install
npm run typecheck
npm run lint
npm run build
```

Then update Git:

```powershell
git add .
git commit -m "Make owner home summaries interactive and add profile page"
git push
```
