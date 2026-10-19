/**
 * SMS → TireGuru work-order runner (owner request 2026-10-19, "开车时下订单").
 *
 * Polls the CRM for owner-confirmed order drafts and keys each one into
 * TireGuru Business Center as a WORK ORDER (non-financial — the desk converts
 * it to an invoice as usual), then reports the WO number back; the CRM texts
 * the owner the outcome.
 *
 * Flow per order (mapped 2026-10-19):
 *   customer_search.php?act=new_wo → businessname search → checkIT(custID) +
 *   doSelect() → notifications interstitial → "Create Work Order >" →
 *   invoicing.php?work_id=… → per item: qty + prod_code + Enter →
 *   "Save &" (doQuit('')) → WO number parsed from the "Work Order #…" header.
 *
 * Scheduled every 5 minutes (Task Scheduler "TireGuru Order Runner",
 * run-orders.cmd). Shares the login profile + credentials file with sync.mjs.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, statSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "https://businesscenter.tireguru.net";
const PROFILE_DIR = join(homedir(), ".tireguru-sync-profile-orders"); // own profile — never fights the report robot
const CRED_FILE = join(homedir(), ".tireguru-sync.json");
const LOCK_FILE = join(HERE, "order-runner.lock");

const log = (line) => {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  try { appendFileSync(join(HERE, "order-runner.log"), msg + "\n"); } catch { /* best effort */ }
};

// ---- overlap guard: skip if another run started < 10 min ago ----
try {
  const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
  if (age < 10 * 60 * 1000) { console.log("another run is active — skipping"); process.exit(0); }
} catch { /* no lock yet */ }
writeFileSync(LOCK_FILE, String(Date.now()));

const cfg = JSON.parse(readFileSync(CRED_FILE, "utf8").replace(/^﻿/, ""));
const CRM = cfg.crmBase || "https://rhino-brain-crm.vercel.app";
if (!cfg.cronSecret) { log("no cronSecret in config — cannot reach the CRM queue"); process.exit(2); }
const AUTH = { authorization: `Bearer ${cfg.cronSecret}` };

async function fetchQueue() {
  const r = await fetch(`${CRM}/api/cron/pos-orders`, { headers: AUTH });
  if (!r.ok) throw new Error(`queue fetch ${r.status}`);
  return (await r.json()).orders ?? [];
}
async function report(id, ok, workOrderNo, error) {
  await fetch(`${CRM}/api/cron/pos-orders`, {
    method: "POST",
    headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ id, ok, workOrderNo, error }),
  }).catch(e => log(`report failed for ${id}: ${e.message}`));
}

async function ensureLoggedIn(page) {
  await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (await page.locator("#logForm").count()) {
    const f = page.locator("#logForm");
    await f.locator("input[name=server]").fill(cfg.server);
    await f.locator("input[name=logID]").fill(cfg.username);
    await f.locator("input[name=pass]").fill(cfg.password);
    await f.locator("input[type=submit]").first().click();
    await page.waitForTimeout(5000);
    await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }
  if (await page.locator("#logForm").count()) throw new Error("TireGuru login failed");
}

/** Switch the session to the order's company. 603 = Rhino FL, 904 = Everflow TX. */
async function switchLocation(page, tag) {
  const locID = tag === "TX" ? "904" : "603";
  const expect = tag === "TX" ? "Everflow" : "Rhino Tire";
  await page.evaluate(async (id) => { await fetch(`/_selectLocation.php?act=change&locID=${id}&height=100`); }, locID);
  await page.goto(`${BASE}/home.php`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const body = await page.locator("body").innerText().catch(() => "");
  if (!body.includes(expect)) throw new Error(`location switch to ${expect} failed`);
}

async function createWorkOrder(page, order) {
  // 1. customer search in new-WO mode
  await page.goto(`${BASE}/customers/customer_search.php?act=new_wo&in_type=0`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("input[name=businessname]").fill(order.customerName);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4000);

  // 2. pick the exact row (checkIT id from the matching row)
  const custID = await page.evaluate((name) => {
    const want = name.toLowerCase().replace(/\s+/g, " ").trim();
    const rows = [...document.querySelectorAll("tr[onclick*='checkIT']")];
    const hit = rows.find(r => (r.textContent || "").toLowerCase().includes(want))
      ?? (rows.length === 1 ? rows[0] : null);
    const m = hit?.getAttribute("onclick")?.match(/checkIT\((\d+)\)/);
    return m ? Number(m[1]) : null;
  }, order.customerName);
  if (!custID) throw new Error(`customer "${order.customerName}" not found in TireGuru search`);
  await page.evaluate((id) => { window.checkIT(id); window.doSelect(); }, custID);
  await page.waitForTimeout(4000);

  // 3. notifications interstitial → Create Work Order
  const createBtn = page.locator("text=Create Work Order").first();
  if (await createBtn.count()) {
    await createBtn.click();
    await page.waitForTimeout(5000);
  }
  if (!page.url().includes("invoicing.php")) throw new Error(`did not reach the WO editor (at ${page.url()})`);

  // 4. add items: qty + prod_code + Enter per line
  for (const item of order.items) {
    if (!item.sku) throw new Error(`item without SKU: ${item.description}`);
    await page.locator("input[name=qty]").fill(String(item.qty));
    await page.locator("input[name=prod_code]").fill(item.sku);
    await page.locator("input[name=prod_code]").press("Enter");
    await page.waitForTimeout(4000);
    // verify the line landed in the items frame
    const seen = await page.evaluate((sku) => {
      for (const f of document.querySelectorAll("frame, iframe")) {
        try { if ((f.contentDocument?.body?.innerText || "").toUpperCase().includes(sku.toUpperCase())) return true; } catch { /* x-origin */ }
      }
      return (document.body.innerText || "").toUpperCase().includes(sku.toUpperCase());
    }, item.sku);
    if (!seen) throw new Error(`item ${item.sku} did not appear on the ticket — aborting before save`);
  }

  // 5. note + WO number from the header
  const woNo = await page.evaluate(() => (document.body.innerText.match(/Work Order\s*#\s*(\d+)/i) || [])[1] ?? null);

  // 6. save & quit
  await page.evaluate(() => window.doQuit(""));
  await page.waitForTimeout(6000);
  return woNo ?? "unknown";
}

async function main() {
  const queue = await fetchQueue();
  if (queue.length === 0) { console.log("queue empty"); return; }
  log(`processing ${queue.length} confirmed order(s)…`);

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true, channel: "msedge", viewport: { width: 1366, height: 900 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on("dialog", async (d) => { log(`dialog: ${d.message().slice(0, 150)}`); await d.accept(); });

  try {
    await ensureLoggedIn(page);
    for (const order of queue) {
      try {
        await switchLocation(page, order.location?.shortTag === "TX" ? "TX" : "FL");
        const woNo = await createWorkOrder(page, order);
        log(`✓ ${order.id} → WO #${woNo} (${order.customerName})`);
        await report(order.id, true, woNo);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ ${order.id} FAILED: ${msg}`);
        await page.screenshot({ path: join(HERE, `order-fail-${order.id.slice(-6)}.png`) }).catch(() => {});
        await report(order.id, false, undefined, msg);
      }
    }
    // never leave the session on Everflow
    await switchLocation(page, "FL").catch(() => {});
  } finally {
    await ctx.close();
  }
}

main().catch((e) => { log(`FATAL: ${e?.stack || e}`); process.exitCode = 1; });
