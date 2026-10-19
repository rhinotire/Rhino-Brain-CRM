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

  // 4. add items. Enter in prod_code opens a LOOKUP overlay (mainDiv frame):
  //    pick the matching row (checkIT), set its qty box, click "Add to Order",
  //    then verify the line landed in the invoice_items frame. (The first
  //    version skipped the overlay and saved empty orders — 2026-10-19.)
  for (const item of order.items) {
    if (!item.sku) throw new Error(`item without SKU: ${item.description}`);
    await page.locator("input[name=qty]").fill(String(item.qty));
    await page.locator("input[name=prod_code]").fill(item.sku);
    await page.locator("input[name=prod_code]").press("Enter");
    await page.waitForTimeout(4500);

    const frame = page.frames().find(f => f.name() === "mainDiv");
    if (!frame) throw new Error("item lookup overlay did not open");
    const rows = await frame.evaluate((sku) =>
      [...document.querySelectorAll("tr[onclick*=checkIT]")].map(tr => {
        const oc = tr.getAttribute("onclick") || "";
        return {
          id: Number((oc.match(/checkIT\((\d+)\)/) || [])[1] ?? 0),
          price: Number((oc.match(/setSelectedPrice\(([\d.]+)\)/) || [])[1] ?? 0),
          hasSku: (tr.textContent || "").toUpperCase().includes(sku.toUpperCase()),
        };
      }).filter(r => r.id > 0 && r.hasSku), item.sku);
    if (rows.length === 0) throw new Error(`lookup showed no row for ${item.sku}`);
    const target = rows.find(r => r.price > 0) ?? rows[0]; // skip zero-price legacy duplicates
    await frame.evaluate(({ id, qty }) => {
      window.checkIT(id);
      const q = document.getElementById("qty_" + id);
      if (q) q.value = String(qty);
    }, { id: target.id, qty: item.qty });
    await frame.locator("text=Add to Order").first().click();
    await page.waitForTimeout(4500);

    const landed = await page.evaluate((sku) => {
      const f = [...document.querySelectorAll("frame, iframe")].find(x => (x.name || x.id) === "invoice_items");
      try { return (f.contentDocument?.body?.innerText || "").toUpperCase().includes(sku.toUpperCase()); } catch { return false; }
    }, item.sku);
    if (!landed) throw new Error(`item ${item.sku} did not land on the ticket — aborting before save`);
  }

  // 5. WO number (header) + internal work_id (URL)
  const woNo = await page.evaluate(() => (document.body.innerText.match(/Work Order\s*#\s*(\d+)/i) || [])[1] ?? null);
  const workId = (page.url().match(/work_id=(\d+)/) || [])[1] ?? null;

  // 6. save & quit
  await page.evaluate(() => window.doQuit(""));
  await page.waitForTimeout(6000);

  // 7. set status to "New Order" (owner's workflow: the desk/warehouse works
  //    off that status). Resolved by label — status IDs are per company.
  //    sendText stays UNCHECKED so the customer never gets an automatic text.
  if (workId) {
    await page.goto(`${BASE}/invoicing/wo_status_change.php?woID=${workId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    const hasOption = await page.evaluate(() => {
      const sel = document.querySelector("select[name=statusID]");
      const opt = sel && [...sel.options].find(o => /^new order$/i.test(o.textContent.trim()));
      if (!opt) return false;
      sel.value = opt.value;
      const st = document.querySelector("input[name=sendText]");
      if (st) st.checked = false;
      return true;
    });
    if (hasOption) {
      await page.locator("text=Change Status").first().click().catch(() => {});
      await page.waitForTimeout(3000);
      log(`  status → New Order for WO #${woNo}`);
    } else {
      log(`  ! could not find "New Order" status option for WO #${woNo} — left at default`);
    }
  }
  return woNo ?? "unknown";
}

async function main() {
  const queue = await fetchQueue();
  if (queue.length === 0) { console.log("queue empty"); return; }
  log(`processing ${queue.length} confirmed order(s)…`);

  // first-run profile initialization can crash headless Edge once — retry
  let ctx, page;
  for (let attempt = 1; ; attempt++) {
    try {
      ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true, channel: "msedge", viewport: { width: 1366, height: 900 } });
      page = ctx.pages()[0] ?? (await ctx.newPage());
      break;
    } catch (e) {
      await ctx?.close().catch(() => {});
      if (attempt >= 3) throw e;
      log(`browser launch failed (attempt ${attempt}) — retrying: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
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
