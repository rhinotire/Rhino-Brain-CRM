/**
 * TireGuru → RHINO BRAIN automated data sync (owner request 2026-10-17:
 * "TIREGURU 不给API, 能否做一个脚本自动跑数据 — 销售、库存、AGING").
 *
 * TireGuru has no public API, so this robot does exactly what William does by
 * hand in Business Center, on a schedule:
 *   1. Signs in with the owner-maintained local credentials file (the session
 *      cookie dies with the browser, so each run signs in fresh).
 *   2. Generates each report via the same form POST the UI sends
 *      (/reports/reportManager.php, chk_xls=1): the response HTML carries one
 *      mem… key, and /reports/show_reports.php?act=…&memkey=… returns the xlsx.
 *   3. Runs both companies: Rhino FL (loc 603), then "Switch Location" to
 *      Everflow (loc 904) via GET /_selectLocation.php?act=change&locID=…,
 *      then switches BACK to FL so a human session is never left on the
 *      wrong company.
 *   4. Imports stock+prices per company (import-tireguru.ts) and the
 *      multi-location A/R aging (import-tireguru-aging.ts) into the CRM.
 *
 * Reports per company: Inventory Stock Status (3), Inventory Price List multi
 * (13), Salesperson Sales Analysis (29, month-to-date). A/R Aged Trial Balance
 * (1) is multi-location, pulled once during the FL phase.
 *
 * Schedule: Windows Task Scheduler "TireGuru Sync" every 2h (run-sync.cmd).
 * No credentials live in this file or the repo.
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
const REPO_APP_DIR = resolve(HERE, "..", "..", "apps", "rhino-brain"); // importers run from here
// TireGuru's session cookie dies with the browser, so scheduled runs sign in
// themselves. William fills this LOCAL file (outside the repo, never committed):
//   { "server": "…", "username": "…", "password": "…" }  (the 3 login fields)
// It is read here at runtime and sent only to businesscenter.tireguru.net.
const CRED_FILE = join(homedir(), ".tireguru-sync.json");
const LOGIN_MODE = process.argv.includes("--login");
const NO_IMPORT = process.argv.includes("--no-import");
// --only=customer_txn[,stock_status…] restricts the run to those report names
// (handy for testing one report without a full ~5-min both-company sweep).
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").map(s => s.trim()).filter(Boolean);
const wantReport = (name) => ONLY.length === 0 || ONLY.includes(name);

const now = new Date();
const mdy = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
const d180ago = new Date(now.getTime() - 180 * 86400000); // reorder-cadence window

const log = (line) => {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  try { appendFileSync(join(HERE, "sync.log"), msg + "\n"); } catch { /* best effort */ }
};

/** Report field sets = the exact POST each Business Center form sends (mapped
 * 2026-10-17 by serializing the live forms). Arrays become repeated params. */
const stockReport = {
  name: "stock_status",
  act: "stock_status",
  // Mirrors William's manual export: mfg_detail layout ("Item" first column +
  // ">>> ITEM TYPE" sections — what import-tireguru.ts parses), Tire/Wheel/Part.
  fields: {
    act: "stock_status", reportID: "3", multi: "", startup: "", spiff: "0",
    date_1: mdy(now), posted: "0", look_mfg: "0", cost: "1", typeID: "0",
    "types[1]": "1", "types[2]": "2", "types[3]": "3",
    groupby: "mfg_detail", single_include_negative_qtys: "1", chk_xls: "1",
  },
};
const priceReport = {
  name: "price_level",
  act: "rep_pricing",
  // Price-level IDs are PER COMPANY (Rhino: GoodLuck 6165 / Retail 6159;
  // Everflow: 6265 / 6276) — resolved from the form by label on every run.
  // Rep-negotiated levels (C-5 / Wholesale / GoodLuck CC) deliberately excluded.
  resolveLevels: {
    pageUrl: "/reports/inventory/inv_pricing_status.php?multiple=1",
    selectName: "lvl_not_used",
    wanted: ["Price Level: 2025 GoodLuck", "Price Level: Retail Markup"],
    fieldName: "lvl_used[]",
  },
  fields: {
    act: "rep_pricing", reportID: "13", single: "0",
    show: "stockable",
    "itemtypes[1]": "1", "itemtypes[2]": "2", "itemtypes[3]": "3", "itemtypes[4]": "4", "itemtypes[5]": "5",
    all_item_types: "on", sort: "0", show_setting: "1", chk_xls: "1",
  },
};
const agedReport = {
  name: "aged_trial_balance",
  act: "rep_cust_aged_trial",
  // The UI's submit JS selects EVERY option of the cust[] multi-select;
  // without the full id list the server returns zero customers (2026-10-17).
  collectOptions: { pageUrl: "/reports/customers/cust_trial_balance.php", selectName: "cust[]", fieldName: "cust[]" },
  fields: {
    act: "rep_cust_aged_trial", reportID: "1", multi: "1", aging_option: "1",
    new_ar_aging_method: "1", companyID: "334",
    forwardUrl: "/reports/customers/cust_trial_balance.php?new=0",
    locationIDs: "858|890|904|899|603", // all company locations
    output: "combined", age_by: "0", date_1: mdy(now), rep_type: "detailed",
    chk_all: "1", salesID: "0",
    // the six balance-bucket filters are checked by default in the UI —
    // omitting them filters out EVERY customer (empty report)
    "only[bal_future]": "1", "only[bal_current]": "1", "only[bal_30]": "1",
    "only[bal_60]": "1", "only[bal_90]": "1", "only[bal_120]": "1",
    phone_num: "1", credit_limit: "1", last_payment: "1", cust_salesperson: "1",
    interactive: "0", chk_xls: "1",
  },
};
const salesReport = {
  name: "salesperson_sales",
  act: "rep_oth_st_sales_analysis",
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
};

// Customer Transaction File (reportID 83): one invoice line per row with the
// customer, date, item/size and qty/sales — rolled up per customer into the
// reorder-cadence mirror. The form carries many filters, so instead of a
// pre-mapped field set we serialize the live form (serializeForm) and override
// only the window (range=1 Custom + 180d), grouping and chk_xls; locationIDs is
// scoped to the running company's location so the pull is per-company.
const reorderReport = {
  name: "customer_txn",
  act: "rep_inv_transaction_file",
  serializeForm: {
    url: "/reports/inventory/transaction_file.php?customer=1",
    overrides: {
      range: "1", date_1: mdy(d180ago), date_2: mdy(now),
      groupby: "item", trans_type: "all", output: "combined",
      amount_inv: "sell", chk_xls: "1",
    },
  },
};

/** Both companies share one TireGuru account; "Switch Location" moves the
 * session. 603 = Rhino Tire USA [1], 904 = Everflow Tires & Wheels [05]. */
const PHASES = [
  { tag: "FL", locID: "603", expect: "Rhino Tire",     reports: [stockReport, priceReport, agedReport, salesReport, reorderReport] },
  { tag: "TX", locID: "904", expect: "Everflow",       reports: [stockReport, priceReport, salesReport, reorderReport] },
];
const HOME_LOC_ID = "603"; // always switch back to Rhino FL at the end

async function switchLocation(page, locID, expect) {
  await page.evaluate(async (id) => {
    await fetch(`/_selectLocation.php?act=change&locID=${id}&height=100`);
  }, locID);
  await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const body = await page.locator("body").innerText().catch(() => "");
  if (!body.includes(expect)) throw new Error(`location switch to ${expect} not confirmed`);
}

/** Reports with a big filter form: serialize the live form exactly as the UI
 * would submit it (default-checked radios, selected options) and override only
 * the given fields + scope locationIDs to this company's location. Avoids the
 * empty-report trap of a hand-mapped partial field set. */
async function pullSerializedReport(page, rep, tag, locID) {
  const { url, overrides } = rep.serializeForm;
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const html = await page.evaluate(async ({ overrides, locID }) => {
    const f = document.querySelector("form");
    const body = new URLSearchParams();
    for (const [k, v] of new FormData(f).entries()) if (typeof v === "string") body.append(k, v);
    for (const [k, v] of Object.entries(overrides)) body.set(k, v);
    body.set("locationIDs", locID); // per-company scope
    const r = await fetch("/reports/reportManager.php", { method: "POST", body });
    return await r.text();
  }, { overrides, locID });
  const memkey = (html.match(/mem[a-f0-9]{10,}/i) || [])[0];
  if (!memkey) throw new Error("no memkey in reportManager response (report may have errored)");
  const dl = await page.evaluate(async ({ act, memkey, locID }) => {
    const r = await fetch(`/reports/show_reports.php?locID=${locID}&act=${act}&memkey=${memkey}&data=`);
    if (!r.ok) throw new Error(`show_reports ${r.status}`);
    const blob = await r.blob();
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
    return { ct: r.headers.get("content-type") || "", b64 };
  }, { act: rep.act, memkey, locID });
  const buf = Buffer.from(dl.b64, "base64");
  if (buf.subarray(0, 2).toString("latin1") !== "PK") throw new Error(`not an xlsx (content-type ${dl.ct}, ${buf.length} bytes)`);
  const file = join(OUT_DIR, `${stamp}_${rep.name}_${tag}.xlsx`);
  writeFileSync(file, buf);
  log(`✓ [${tag}] ${rep.name}: ${buf.length} bytes → ${file}`);
  return file;
}

async function pullReport(page, rep, tag, locID) {
  if (rep.serializeForm) return pullSerializedReport(page, rep, tag, locID);
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
  if (rep.resolveLevels) {
    const { pageUrl, selectName, wanted, fieldName } = rep.resolveLevels;
    await page.goto(`${BASE}${pageUrl}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const ids = await page.evaluate(({ sel, wanted }) => {
      const el = document.querySelector(`select[name='${sel}']`);
      if (!el) return [];
      const byLabel = new Map([...el.options].map((o) => [o.textContent.trim(), o.value]));
      return wanted.map((w) => byLabel.get(w)).filter(Boolean);
    }, { sel: selectName, wanted });
    if (ids.length !== wanted.length) throw new Error(`price levels not all found (got ${ids.length}/${wanted.length})`);
    fields[fieldName] = ids;
  }

  // 1. Generate (same POST the form makes); the response carries one mem… key.
  const html = await page.evaluate(async (f) => {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
      else body.append(k, v);
    }
    const r = await fetch("/reports/reportManager.php", { method: "POST", body });
    return await r.text();
  }, fields);
  const memkey = (html.match(/mem[a-f0-9]{10,}/i) || [])[0];
  if (!memkey) throw new Error("no memkey in reportManager response (report may have errored)");

  // 2. Download the generated Excel.
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
    return { ct: r.headers.get("content-type") || "", b64 };
  }, { act: rep.act, memkey, locID });

  const buf = Buffer.from(dl.b64, "base64");
  if (buf.subarray(0, 2).toString("latin1") !== "PK") {
    throw new Error(`not an xlsx (content-type ${dl.ct}, ${buf.length} bytes)`);
  }
  const file = join(OUT_DIR, `${stamp}_${rep.name}_${tag}.xlsx`);
  writeFileSync(file, buf);
  log(`✓ [${tag}] ${rep.name}: ${buf.length} bytes → ${file}`);
  return file;
}

function runImporter(label, cmd) {
  log(`importing: ${label}…`);
  try {
    const out = execSync(cmd, { cwd: REPO_APP_DIR, encoding: "utf8", timeout: 1800000 });
    log(`${label} done. Last lines:\n` + out.trim().split("\n").slice(-4).join("\n"));
    return true;
  } catch (e) {
    log(`${label} FAILED: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

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
  const files = {}; // `${name}_${tag}` → path

  try {
    await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const loggedIn = async () =>
      !(await page.locator("#logForm").count()) && page.url().includes("home.php");

    if (!(await loggedIn())) {
      let creds = null;
      try { creds = JSON.parse(readFileSync(CRED_FILE, "utf8").replace(/^\uFEFF/, "")); } catch (e) { log(`credentials file unreadable: ${e.message}`); }
      if (!LOGIN_MODE && creds?.server && creds?.username && creds?.password && creds.username !== "FILL_ME") {
        log("signing in…");
        const form = page.locator("#logForm");
        await form.locator("input[name=server]").fill(creds.server);
        await form.locator("input[name=logID]").fill(creds.username);
        await form.locator("input[name=pass]").fill(creds.password);
        await Promise.all([
          page.waitForURL("**/home.php**", { timeout: 60000 }),
          form.locator("input[type=submit]").first().click(),
        ]).catch(() => {});
        // settle + re-check once more — the first wait can race a slow redirect
        await page.waitForTimeout(4000);
        await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      }
      if (!(await loggedIn())) {
        if (!LOGIN_MODE) {
          log(`NOT LOGGED IN — fill ${CRED_FILE} with {"server":"…","username":"…","password":"…"} (or run: node sync.mjs --login).`);
          process.exitCode = 2;
          return;
        }
        log("Please sign in to TireGuru in the opened window (waiting up to 5 minutes)…");
        await page.waitForURL("**/home.php**", { timeout: 300000 });
        log("Login detected.");
      }
    }

    let failures = 0;
    for (const phase of PHASES) {
      try {
        await switchLocation(page, phase.locID, phase.expect);
        log(`— location: ${phase.expect} [${phase.tag}] —`);
      } catch (e) {
        log(`✗ [${phase.tag}] location switch FAILED: ${e instanceof Error ? e.message : e}`);
        failures += phase.reports.length;
        continue;
      }
      for (const rep of phase.reports) {
        if (!wantReport(rep.name)) continue;
        try {
          files[`${rep.name}_${phase.tag}`] = await pullReport(page, rep, phase.tag, phase.locID);
        } catch (e) {
          failures++;
          log(`✗ [${phase.tag}] ${rep.name} FAILED: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    // leave the account on the home location, never on Everflow
    await switchLocation(page, HOME_LOC_ID, "Rhino Tire").catch(() => {});

    if (!NO_IMPORT) {
      for (const tag of ["FL", "TX"]) {
        const stock = files[`stock_status_${tag}`];
        const price = files[`price_level_${tag}`];
        // Product price fields are GLOBAL (shared catalog): only the FL run may
        // write prices; the TX run is inventory-only so Everflow's price levels
        // can never clobber Rhino's priceA/msrp. TX-only SKUs still get created.
        const extra = tag === "TX" ? " --inventory-only" : "";
        if (stock && price) {
          runImporter(`stock${tag === "FL" ? "+prices" : " (inventory-only)"} ${tag}`,
            `npx tsx ../../import-tireguru.ts --stock "${stock}" --price "${price}" --location ${tag} --stocked-only${extra} --apply`);
        } else log(`skipping stock import ${tag} (download missing)`);
      }
      const aged = files["aged_trial_balance_FL"];
      if (aged) {
        runImporter("A/R aging (all locations)",
          `npx tsx ../../import-tireguru-aging.ts --file "${aged}" --apply`);
      } else log("skipping aging import (download missing)");
      for (const tag of ["FL", "TX"]) {
        const sales = files[`salesperson_sales_${tag}`];
        if (sales) {
          runImporter(`sales ${tag}`,
            `npx tsx ../../import-tireguru-sales.ts --file "${sales}" --location ${tag} --apply`);
        }
      }
      for (const tag of ["FL", "TX"]) {
        const txn = files[`customer_txn_${tag}`];
        if (txn) {
          // one transaction file feeds both: per-customer cadence + per-SKU velocity
          runImporter(`reorder ${tag}`,
            `npx tsx ../../import-tireguru-reorder.ts --file "${txn}" --location ${tag} --apply`);
          runImporter(`velocity ${tag}`,
            `npx tsx ../../import-tireguru-velocity.ts --file "${txn}" --location ${tag} --apply`);
        }
      }
    }

    // Piggyback: poll the freight-quote inbox on the CRM (no Vercel sub-daily
    // crons on Hobby; this robot already runs every 2h). Config keys crmBase +
    // cronSecret in the local credentials file enable it.
    try {
      const cfg = JSON.parse(readFileSync(CRED_FILE, "utf8").replace(/^﻿/, ""));
      if (cfg.cronSecret) {
        const base = cfg.crmBase || "https://rhino-brain-crm.vercel.app";
        const r = await fetch(`${base}/api/cron/freight-poll`, { headers: { authorization: `Bearer ${cfg.cronSecret}` } });
        log(`freight inbox poll: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
    } catch (e) {
      log(`freight inbox poll failed: ${e instanceof Error ? e.message : e}`);
    }

    const got = Object.keys(files).length;
    log(`run complete — ${got} reports saved, ${failures} failed`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await ctx.close();
  }
}

main().catch((e) => { log(`FATAL: ${e?.stack || e}`); process.exitCode = 1; });
