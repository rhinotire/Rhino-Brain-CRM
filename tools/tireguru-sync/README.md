# TireGuru → RHINO BRAIN Sync Robot

TireGuru has no public API, so this robot replays the Business Center report
forms on a schedule and feeds the results into the CRM. Credentials never live
in code: you sign in **once** in the robot's own browser window and the session
persists in a local profile (`%USERPROFILE%\.tireguru-sync-profile`).

## One-time setup

```
cd tools\tireguru-sync
npm install
npx playwright install chromium
npm run login        # a browser window opens — sign in to TireGuru yourself
```

## What each run does

1. Generates and downloads 4 Excel reports into
   `…\RHINO DIGITAL PLATFORM\Tireguru_Export\auto\`:
   - Inventory Stock Status (today)
   - Inventory Price List — Multiple Levels (2025 GoodLuck + Retail Markup only)
   - Customer Aged Trial Balance (all locations, detailed)
   - Salesperson Sales Analysis (month-to-date, invoice detail)
2. Runs the proven `import-tireguru.ts --apply` to sync stock + prices into the
   CRM database. (Aging + sales importers come next; files are collected now.)

Manual run: `npm run sync`. Log: `sync.log` in this folder.
If a run reports `NOT LOGGED IN`, the TireGuru session expired — run
`npm run login` again.

## Schedule (every 2 hours, 8:00–20:00)

Run once in an **Administrator** PowerShell:

```powershell
schtasks /Create /TN "TireGuru Sync" /SC HOURLY /MO 2 /ST 08:00 ^
  /TR "cmd /c cd /d \"C:\Users\willi\OneDrive\Desktop\RHINO BRAIN CRM\tirepro-crm\tools\tireguru-sync\" && node sync.mjs"
```

Remove with `schtasks /Delete /TN "TireGuru Sync" /F`.

## Report form reference (mapped 2026-10-17)

All reports POST to `/reports/reportManager.php`; the response HTML contains a
single `mem…` key, and the Excel is then fetched from
`/reports/show_reports.php?locID=603&act=<act>&memkey=<key>&data=`.

| Report | act | reportID |
| --- | --- | --- |
| Inventory Stock Status | `stock_status` | 3 |
| Inventory Price List (multi-level) | `rep_pricing` | 13 |
| Customer Aged Trial Balance | `rep_cust_aged_trial` | 1 |
| Salesperson Sales Analysis | `rep_oth_st_sales_analysis` | 29 (type=24) |

Price-level IDs: `6165` = 2025 GoodLuck (→ priceA), `6159` = Retail Markup
(→ msrp). Rep-negotiated levels (C-5, Wholesale, GoodLuck CC) are deliberately
never pulled. TireGuru location id `603` = Rhino Tire USA FL "[1]";
aged trial covers all locations via `locationIDs=858|890|904|899|603`.
