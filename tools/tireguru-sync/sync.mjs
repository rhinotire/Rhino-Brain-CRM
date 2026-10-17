/**
 * TireGuru → RHINO BRAIN automated data sync (owner request 2026-10-17:
 * "TIREGURU 不给API, 能否做一个脚本自动跑数据 — 销售、库存、AGING").
 *
 * TireGuru has no public API, so this robot does exactly what William does by
 * hand in Business Center, on a schedule:
 *   1. Reuses a persistent logged-in browser profile (run `node sync.mjs --login`
 *      once and sign in yourself in the window that opens; the session persists).
 *   2. Generates each report via the same form POST the UI sends
 *      (/reports/reportManager.php, chk_xls=1), then downloads the Excel from
 *      /reports/show_reports.php?act=...&memkey=...
 *   3. Saves the .xlsx files into the Tireguru_Export/auto folder and runs the
 *      proven import-tireguru.ts importer for stock+prices (--apply).
 *
 * Reports pulled (the three William tracks + prices for the importer):
 *   - Inventory Stock Status        (act stock_status,        reportID 3)
 *   - Inventory Price List (multi)  (act rep_pricing,         reportID 13)
 *   - Customer Aged Trial Balance   (act rep_cust_aged_trial, reportID 1, all locations)
 *   - Salesperson Sales Analysis    (act rep_oth_st_sales_analy, reportID 29, month-to-date)
 *
 * Schedule (every 2h, 8am–8pm): see README.md in this folder.
 * No credentials live in this file or in the repo — the login session lives in
 * the local browser profile under %USERPROFILE%.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "https://businesscenter.tireguru.net";
const PROFILE_DIR = join(homedir(), ".tireguru-sync-profile");
const OUT_DIR = "C:\\Users\\willi\\OneDrive\\Documents\\RHINO DIGITAL PLATFORM\\Tireguru_Export\\auto";
const REPO_APP_DIR = resolve(HERE, "..", "..", "apps", "rhino-brain"); // importer runs from here
const LOC_ID = "603"; // Rhino Tire USA FL [1] — TireGuru internal location id
// TireGuru's session cookie dies with the browser, so scheduled runs sign in
// themselves. William fills this LOCAL file (outside the repo, never committed):
//   { "username": "…", "password": "…" }
// It is read here at runtime and sent only to businesscenter.tireguru.net.
const CRED_FILE = join(homedir(), ".tireguru-sync.json");
const LOGIN_MODE = process.argv.includes("--login");
const NO_IMPORT = process.argv.includes("--no-import");

const now = new Date();
const mdy = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

const log = (line) => {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  try { appendFileSync(join(HERE, "sync.log"), msg + "\n"); } catch { /* best effort */ }
};

/** Each report = the exact field set its Business Center form posts (mapped
 * 2026-10-17). Arrays become repeated params (multi-selects / checkboxes). */
const REPORTS = [
  {
    name: "stock_status",
    act: "stock_status",
    // Mirrors William's manual export (verified against 1_stock_status_report_20260723):
    // mfg_detail layout ("Item" first column + ">>> ITEM TYPE" sections, what
    // import-tireguru.ts parses), Tire/Wheel/Part only, no zero-stock rows.
    fields: {
      act: "stock_status", reportID: "3", multi: "", startup: "", spiff: "0",
      date_1: mdy(now), posted: "0", look_mfg: "0", cost: "1", typeID: "0",
      "types[1]": "1", "types[2]": "2", "types[3]": "3",
      groupby: "mfg_detail", single_include_negative_qtys: "1", chk_xls: "1",
    },
  },
  {
    name: "price_level",
    act: "rep_pricing",
    fields: {
      act: "rep_pricing", reportID: "13", single: "0",
      // 6165 = "2025 GoodLuck" (dealer price → priceA), 6159 = "Retail Markup" (→ msrp).
      // Rep-negotiated levels (C-5 / Wholesale / GoodLuck CC) deliberately excluded.
      "lvl_used[]": ["6165", "6159"],
      show: "stockable",
      "itemtypes[1]": "1", "itemtypes[2]": "2", "itemtypes[3]": "3", "itemtypes[4]": "4", "itemtypes[5]": "5",
      all_item_types: "on", sort: "0", show_setting: "1", chk_xls: "1",
    },
  },
  {
    name: "aged_trial_balance",
    act: "rep_cust_aged_trial",
    // The UI's submit JS selects EVERY option of the cust[] multi-select;
    // without the full id list the server returns zero customers (2026-10-17).
    collectOptions: { pageUrl: "/reports/customers/cust_trial_balance.php", selectName: "cust[]", fieldName: "cust[]" },
    fields: {
      act: "rep_cust_aged_trial", reportID: "1", multi: "1", aging_option: "1",
      new_ar_aging_method: "1", companyID: "334",
      forwardUrl: "/reports/customers/cust_trial_balance.php?new=0",
      locationIDs: "858|890|904|899|603", // all company locations (FL + TX + …)
      output: "combined", age_by: "0", date_1: mdy(now), rep_type: "detailed",
      chk_all: "1", salesID: "0",
      // the six balance-bucket filters are checked by default in the UI —
      // omitting them filters out EVERY customer (empty report, found 2026-10-17)
      "only[bal_future]": "1", "only[bal_current]": "1", "only[bal_30]": "1",
      "only[bal_60]": "1", "only[bal_90]": "1", "only[bal_120]": "1",
      phone_num: "1", credit_limit: "1", last_payment: "1", cust_salesperson: "1",
      interactive: "0", chk_xls: "1",
    },
  },
  {
    name: "salesperson_sales",
    act: "rep_oth_st_sales_analysis", // full act name — a truncated field dump cost the first run
    fields: {
      act: "rep_oth_st_sales_analysis", reportID: "29", type: "24", spiff: "0",
      multi: "", comdue: "0",
      level: "invdetail", groupby: "invoice",
      date_1: mdy(firstOfMonth), date_2: mdy(now), // month-to-date
      sale_cust: "sales", inv_acct: "by_acct", employeeID: "0", inv_types: "0",
      "itemtype[1]": "1", "itemtype[2]": "2", "itemtype[3]": "3", "itemtype[4]": "4", "itemtype[5]": "5",
      all_item_types: "on", itemnum: "", per_page: "1",
      inc_natl: "1", inc_adjustments: "1", interactive: "0", chk_xls: "1",
    },
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PROFILE_DIR, { recursive: true });

  // channel msedge: drive the system-installed Edge (the Playwright-bundled
  // Chromium hits a SxS error on this machine, 2026-10-17)
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !LOGIN_MODE,
    channel: "msedge",
    viewport: { width: 1280, height: 850 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  try {
    await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const loggedIn = async () =>
      !(await page.locator("#logForm").count()) && page.url().includes("home.php");

    if (!(await loggedIn())) {
      // Scheduled runs: sign in with the owner-maintained local credentials file.
      let creds = null;
      try { creds = JSON.parse(readFileSync(CRED_FILE, "utf8").replace(/^﻿/, "")); } catch (e) { log(`credentials file unreadable: ${e.message}`); }
      // TireGuru's login form has three fields: server, logID, pass.
      if (!LOGIN_MODE && creds?.server && creds?.username && creds?.password && creds.username !== "FILL_ME") {
        log("session expired — signing in…");
        const form = page.locator("#logForm");
        await form.locator("input[name=server]").fill(creds.server);
        await form.locator("input[name=logID]").fill(creds.username);
        await form.locator("input[name=pass]").fill(creds.password);
        await Promise.all([
          page.waitForURL("**/home.php**", { timeout: 60000 }),
          form.locator("input[type=submit]").first().click(),
        ]).catch(() => {});
      }
      if (!(await loggedIn())) {
        if (!LOGIN_MODE) {
          log(`NOT LOGGED IN — fill ${CRED_FILE} with {"username":"…","password":"…"} (or run: node sync.mjs --login).`);
          process.exitCode = 2;
          return;
        }
        log("Please sign in to TireGuru in the opened window (waiting up to 5 minutes)…");
        await page.waitForURL("**/home.php**", { timeout: 300000 });
        log("Login detected.");
      }
    }

    const saved = [];
    for (const rep of REPORTS) {
      try {
        const fields = { ...rep.fields };
        if (rep.collectOptions) {
          const { pageUrl, selectName, fieldName } = rep.collectOptions;
          await page.goto(`${BASE}${pageUrl}`, { waitUntil: "domcontentloaded", timeout: 60000 });
          const values = await page.evaluate((sel) => {
            const el = document.querySelector(`select[name='${sel}']`);
            return el ? [...el.options].map((o) => o.value).filter(Boolean) : [];
          }, selectName);
          if (values.length === 0) throw new Error(`no options found for ${selectName}`);
          fields[fieldName] = values;
        }
        // 1. Generate the report (same POST the form makes). The response HTML
        //    carries exactly one mem… key identifying the generated file.
        const html = await page.evaluate(async (fields) => {
          const body = new URLSearchParams();
          for (const [k, v] of Object.entries(fields)) {
            if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
            else body.append(k, v);
          }
          const r = await fetch("/reports/reportManager.php", { method: "POST", body });
          return await r.text();
        }, fields);
        const memkey = (html.match(/mem[a-f0-9]{10,}/i) || [])[0];
        if (!memkey) throw new Error("no memkey in reportManager response (report may have errored)");

        // 2. Download the Excel the server just generated.
        const dl = await page.evaluate(async ({ act, memkey, locID }) => {
          const r = await fetch(`/reports/show_reports.php?locID=${locID}&act=${act}&memkey=${memkey}&data=`);
          if (!r.ok) throw new Error(`show_reports ${r.status}`);
          const blob = await r.blob();
          const b64 = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(",")[1]);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          return { ct: r.headers.get("content-type") || "", cd: r.headers.get("content-disposition") || "", b64 };
        }, { act: rep.act, memkey, locID: LOC_ID });

        const buf = Buffer.from(dl.b64, "base64");
        if (buf.subarray(0, 2).toString("latin1") !== "PK") {
          throw new Error(`not an xlsx (content-type ${dl.ct}, ${buf.length} bytes)`);
        }
        const file = join(OUT_DIR, `${stamp}_${rep.name}.xlsx`);
        writeFileSync(file, buf);
        saved.push({ name: rep.name, file, bytes: buf.length });
        log(`✓ ${rep.name}: ${buf.length} bytes → ${file}`);
      } catch (e) {
        log(`✗ ${rep.name} FAILED: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 3. Feed stock + prices into the CRM with the proven importer.
    const stock = saved.find((s) => s.name === "stock_status");
    const price = saved.find((s) => s.name === "price_level");
    if (!NO_IMPORT && stock && price) {
      log("importing stock+prices into CRM (import-tireguru.ts --apply)…");
      try {
        const out = execSync(
          `npx tsx ../../import-tireguru.ts --stock "${stock.file}" --price "${price.file}" --location FL --stocked-only --apply`,
          { cwd: REPO_APP_DIR, encoding: "utf8", timeout: 1500000 }
        );
        log("importer done. Last lines:\n" + out.trim().split("\n").slice(-6).join("\n"));
      } catch (e) {
        log(`importer FAILED: ${e instanceof Error ? e.message : e}`);
      }
    } else if (!NO_IMPORT) {
      log("skipping CRM import (stock or price download missing)");
    }

    log(`run complete — ${saved.length}/${REPORTS.length} reports saved`);
    process.exitCode = saved.length === REPORTS.length ? 0 : 1;
  } finally {
    await ctx.close();
  }
}

main().catch((e) => { log(`FATAL: ${e?.stack || e}`); process.exitCode = 1; });
