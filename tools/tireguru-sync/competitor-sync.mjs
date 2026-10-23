/**
 * Competitor price watch (owner request 2026-10-20). Uses the owner's OWN
 * dealer accounts (QTD / TGI / Tire Dispatch — they trade with each other) to
 * check a size watchlist once a day, politely: one search per watched size,
 * ~2s apart, same volume as a human reading prices.
 *
 * Credentials live ONLY in %USERPROFILE%\.competitor-sync.json (owner-filled).
 * Watchlist comes from the CRM (top stocked tire sizes); results post back to
 * /api/cron/competitor-prices and show on the CRM's Competitor Prices page.
 *
 * Sites implemented: TGI (custserv.tiregroup.com, ASP.NET portal).
 * QTD / Tire Dispatch: next.
 */
import { chromium } from "playwright";
import { readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(homedir(), ".competitor-sync-profile2"); // fresh profile — the old one had a broken Tire Dispatch session
const CRED_FILE = join(homedir(), ".competitor-sync.json");
const SYNC_CFG = JSON.parse(readFileSync(join(homedir(), ".tireguru-sync.json"), "utf8").replace(/^﻿/, ""));
const CRM = SYNC_CFG.crmBase || "https://rhino-brain-crm.vercel.app";
const AUTH = { authorization: `Bearer ${SYNC_CFG.cronSecret}` };

// overlap guard — the 5-min scheduled task and manual runs share one profile
import { statSync, writeFileSync as wf } from 'node:fs';
const LOCK = join(HERE, 'competitor-sync.lock');
try { if (Date.now() - statSync(LOCK).mtimeMs < 15 * 60 * 1000) { console.log('another run is active — skipping'); process.exit(0); } } catch { /* no lock */ }
wf(LOCK, String(Date.now()));

const log = (line) => {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  try { appendFileSync(join(HERE, "competitor-sync.log"), msg + "\n"); } catch { /* best effort */ }
};
const money = (s) => {
  const n = Number(String(s ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function tgi(page, creds, sizes) {
  const PORTAL = "https://custserv.tiregroup.com/site/cpgCustService.aspx";
  await page.goto(PORTAL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  if (page.url().includes("frmLogin")) {
    await page.locator("input[name=txtUserName]").fill(creds.username);
    await page.locator("input[name=txtPassword]").fill(creds.password);
    await page.locator("input[name=btnSubmit]").click();
    await page.waitForTimeout(5000);
    if (page.url().includes("frmLogin")) throw new Error("TGI login failed");
  }

  const rows = [];
  for (const s of sizes) {
    try {
      await page.goto(PORTAL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.locator("input[name='ctl00$PageContent$txtSearch']").fill(s.sizeKey);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(5000);
      const found = await page.evaluate(() => {
        const tables = [...document.querySelectorAll("table")].filter(t => /\$/.test(t.innerText));
        const t = tables[tables.length - 1];
        if (!t) return [];
        return [...t.querySelectorAll("tr")]
          .map(tr => [...tr.children].map(td => (td.innerText || "").trim()))
          .filter(c => c.length >= 8 && /\$/.test(c[7] ?? ""))
          .map(c => ({ description: c[1], partCode: c[2], availability: c[5], fet: c[6], price: c[7] }));
      });
      for (const f of found) {
        const price = money(f.price);
        if (!price) continue;
        rows.push({
          sizeKey: s.sizeKey,
          description: f.description.replace(/\s+/g, " ").slice(0, 120),
          partCode: f.partCode || undefined,
          availability: f.availability || undefined,
          fet: money(f.fet) ?? undefined,
          price,
        });
      }
      log(`  tgi ${s.display}: ${found.length} offers`);
      await sleep(2000);
    } catch (e) {
      log(`  tgi ${s.display} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  return rows;
}

const PENDING_MODE = process.argv.includes("--pending");

async function qtd(page, creds, sizes) {
  await page.goto("https://qtdonline.com/login-user/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  if (await page.locator("input[name=customer_id]").count()) {
    await page.locator("input[name=customer_id]").fill(creds.username);
    await page.locator("input[name=password]").fill(creds.password);
    await page.locator("text=Sign In").first().click();
    await page.waitForTimeout(7000);
  }
  if (!(await page.evaluate(() => document.body.innerText.includes("Log Out")))) throw new Error("QTD login failed");

  const rows = [];
  for (const s of sizes) {
    try {
      await page.goto("https://qtdonline.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      await page.locator("input[name=quick_tire_size_1]").fill(s.sizeKey);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(12000);
      // result cells (mapped 2026-10-20): [3]=prod#, [7]=size, [8]=desc+brand,
      // [9]=local avail, [11]=next-day avail, [16]=cost (dealer, incl FET)
      const found = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        for (const tr of document.querySelectorAll("table tr")) {
          const c = [...tr.children].map(td => (td.innerText || "").trim());
          // size cell: metric (215/55R17), flotation (33X12.50R18) or ST/LT variants
          if (c.length < 17 || !/(\d{2,3}\/\d{2,3}R?\d{2})|(\d{2}X\d{2}(\.\d+)?R?\d{2})/i.test(c[7] ?? "")) continue;
          if (!c[3] || seen.has(c[3])) continue;
          seen.add(c[3]);
          out.push({ partCode: c[3], size: c[7], desc: c[8], local: c[9], nextDay: c[11], cost: c[16] });
        }
        return out;
      });
      for (const f of found) {
        const price = money(f.cost);
        if (!price) continue;
        rows.push({
          sizeKey: s.sizeKey,
          description: `${f.size} ${f.desc}`.replace(/\s+/g, " ").slice(0, 120),
          partCode: f.partCode || undefined,
          availability: `${f.local || 0} local / ${(f.nextDay || "0").trim()} ND`.slice(0, 30),
          price,
        });
      }
      log(`  qtd ${s.display}: ${found.length} offers`);
      await sleep(2000);
    } catch (e) {
      log(`  qtd ${s.display} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  return rows;
}

async function tiredispatch(_sharedPage, creds, sizes) {
  // Tire Dispatch needs its OWN browser context — sharing the page with the
  // TGI/QTD logins breaks its search (returns 0). Fresh context every run.
  const tdCtx = await chromium.launchPersistentContext(join(homedir(), ".tiredispatch-profile"), { headless: true, channel: "msedge", viewport: { width: 1366, height: 900 } });
  const page = tdCtx.pages()[0] ?? (await tdCtx.newPage());
  try {
  // login (NetSuite storefront; session does not persist between runs)
  await page.goto("https://www.tiredispatch.com/scs/checkout.ssp?is=login&login=T", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  if (await page.locator("input[name=email]").count()) {
    await page.locator("input[name=email]").fill(creds.username);
    await page.locator("input[name=password]").fill(creds.password);
    // Enter does NOT submit this form — must click the LOG IN button (2026-10-22)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button, input[type=submit], a")].find(e => /^log ?in$/i.test((e.value || e.textContent || "").trim()));
      b?.click();
    });
    await page.waitForTimeout(9000);
  }
  if (!(await page.evaluate(() => document.body.innerText.includes("Log Out") || document.body.innerText.includes("Welcome Tire")))) {
    throw new Error("Tire Dispatch login failed");
  }

  const rows = [];
  for (const s of sizes) {
    try {
      // the owner's own path: /search?keywords=<digits> (e.g. 2055516).
      // results load async — networkidle + a short poll (domcontentloaded shows 0).
      await page.goto(`https://www.tiredispatch.com/search?keywords=${s.sizeKey}`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(6000); // results render shortly after networkidle
      for (let i = 0; i < 4; i++) {
        if (await page.evaluate(() => /Sku:/.test(document.body.innerText))) break;
        await page.waitForTimeout(3000);
      }
      const found = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        // smallest element whose text has both a Sku and a price = one product card
        for (const el of document.querySelectorAll("div, li, article")) {
          if (el.querySelector("div, li, article")) continue; // leaf-ish containers only? no — need card; use text test
        }
        // walk cards: any element containing "Sku:" and a $price, dedupe by Sku
        for (const el of document.querySelectorAll("div, li, article")) {
          const raw = el.innerText || "";
          if (!/Sku:/.test(raw) || raw.length > 900) continue;
          const t = raw.replace(/\s+/g, " ");
          const sku = (t.match(/Sku:\s*(\S+)/i) || [])[1];
          if (!sku || seen.has(sku)) continue;
          const price = (t.match(/\$\s?([\d,]+\.\d{2})/) || [])[1];
          const avail = (t.match(/Available NOW\s*([\d+]+)/i) || [])[1];
          // title = the line that names the tire (brand + size), not the "+" toggle
          const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
          const title = (lines.find(l => /\d{2,3}\/\d{2,3}R?\d{2}|\d{2}X\d/.test(l) && /[A-Za-z]/.test(l)) || lines[0] || "").slice(0, 120);
          if (title && price) { seen.add(sku); out.push({ title, sku, price, avail }); }
        }
        return out;
      });
      for (const f of found) {
        const price = money(f.price);
        if (!price || price > 9000) continue; // $9,999.85 = no-price placeholder
        rows.push({
          sizeKey: s.sizeKey,
          description: f.title.slice(0, 120),
          partCode: f.sku || undefined,
          availability: f.avail ? `${f.avail} avail` : undefined,
          price,
        });
      }
      log(`  tiredispatch ${s.display}: ${found.length} cards, ${rows.filter(r => r.sizeKey === s.sizeKey).length} priced`);
      await sleep(2000);
    } catch (e) {
      log(`  tiredispatch ${s.display} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  return rows;
  } finally {
    await tdCtx.close();
  }
}

/** Economy Tire — TireLink v3 SPA portal (tl-….tirelinkv3.tireguru.net).
 * Login at economytire.com redirects to the portal; /lookup/tires raw search;
 * product cards show "Cost: $X/ea", "FET: $X/ea", "OH: N Ft. Worth: N". */
async function economytire(_shared, creds, sizes) {
  const ctx = await chromium.launchPersistentContext(join(homedir(), ".economytire-profile"), { headless: true, channel: "msedge", viewport: { width: 1366, height: 1100 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto("https://www.economytire.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    if (await page.locator("input[name=username]").count()) {
      await page.locator("input[name=username]").fill(creds.username);
      await page.locator("input[type=password]").first().fill(creds.password);
      await page.evaluate(() => { const b = [...document.querySelectorAll("button,input[type=submit],a")].find(e => /^log ?in|^sign ?in/i.test((e.value || e.textContent || "").trim())); b?.click(); });
      await page.waitForTimeout(8000);
    }
    if (!/tirelinkv3/.test(page.url())) throw new Error("Economy Tire login failed");
    const portal = new URL(page.url()).origin;

    const rows = [];
    for (const s of sizes) {
      try {
        await page.goto(`${portal}/lookup/tires`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(4000);
        await page.locator("input[name=raw]").fill(s.sizeKey);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(9000);
        const found = await page.evaluate(() => {
          const out = []; const seen = new Set();
          // the details/price column has exactly ONE "Cost:" and a "Size:"
          const cells = [...document.querySelectorAll("div,article,li")].filter(e => {
            const x = e.innerText || "";
            return (x.match(/Cost:/g) || []).length === 1 && /Size:/.test(x);
          });
          const leaves = cells.filter(el => !cells.some(o => o !== el && el.contains(o)));
          const oneCost = (el) => ((el.innerText || "").match(/Cost:/g) || []).length === 1;
          for (const leaf of leaves) {
            // climb to the LARGEST ancestor still holding exactly one Cost: = the whole card
            let card = leaf;
            while (card.parentElement && oneCost(card.parentElement)) card = card.parentElement;
            const t = (card.innerText || "").replace(/\s+/g, " ");
            const size = (t.match(/Size:\s*(\S+)/) || [])[1] || "";
            const cost = (t.match(/Cost:\s*\$([\d,]+\.\d{2})/) || [])[1];
            const fet = (t.match(/FET:\s*\$([\d,]+\.\d{2})/) || [])[1];
            const ftw = (t.match(/Ft\.?\s*Worth:\s*([\d+]+)/i) || [])[1];
            if (!cost) continue;
            const ls = (card.innerText || "").split("\n").map(l => l.trim()).filter(Boolean);
            const item = ls.find(l => /^[A-Z0-9][A-Z0-9'\- ]{3,}$/.test(l) && /\d/.test(l)) || "";
            const name = ls.find(l => /[A-Za-z]{3}/.test(l) && l !== item && !/^(Size|Speed|Load|Ply|Service|Cost|FET|OH|QTY|MFG|Weight|Material|Compare|Add to|New Search|Display|Sort|Filters)\b/i.test(l) && l.length < 60) || "";
            const key = item || name || size + cost;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ item, descr: name, size, cost, fet, ftw });
          }
          return out;
        });
        for (const f of found) {
          const price = money(f.cost);
          if (!price) continue;
          rows.push({
            sizeKey: s.sizeKey,
            description: `${f.size} ${f.descr}`.replace(/\s+/g, " ").slice(0, 120),
            partCode: f.item || undefined,
            availability: f.ftw ? `${f.ftw} Ft.Worth` : undefined,
            fet: money(f.fet) ?? undefined,
            price,
          });
        }
        log(`  economytire ${s.display}: ${found.length} offers`);
        await sleep(2000);
      } catch (e) {
        log(`  economytire ${s.display} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    }
    return rows;
  } finally {
    await ctx.close();
  }
}

// which company each competitor site belongs to
const SITE_COMPANY = { tgi: "RHINO", qtd: "RHINO", tiredispatch: "RHINO", economytire: "EVERFLOW", bzo: "EVERFLOW", bhy: "EVERFLOW" };

async function main() {
  const creds = JSON.parse(readFileSync(CRED_FILE, "utf8").replace(/^﻿/, ""));
  const hasCreds = (name) => creds[name]?.username && creds[name].username !== "FILL_ME";

  // per-company watchlist + lookup queue
  const sizesFor = {}, lookupIdsFor = {};
  for (const company of ["RHINO", "EVERFLOW"]) {
    if (PENDING_MODE) {
      const r = await fetch(`${CRM}/api/cron/competitor-prices?pending=1&company=${company}`, { headers: AUTH });
      const { lookups } = r.ok ? await r.json() : { lookups: [] };
      sizesFor[company] = lookups;
      lookupIdsFor[company] = lookups.map(l => l.id);
    } else {
      const wl = await fetch(`${CRM}/api/cron/competitor-prices?company=${company}`, { headers: AUTH });
      sizesFor[company] = wl.ok ? (await wl.json()).sizes : [];
      lookupIdsFor[company] = [];
    }
  }
  if (PENDING_MODE && sizesFor.RHINO.length === 0 && sizesFor.EVERFLOW.length === 0) { console.log("no pending lookups"); return; }
  log(`sizes — RHINO ${sizesFor.RHINO.length}, EVERFLOW ${sizesFor.EVERFLOW.length}`);

  const post = async (name, rows) => {
    const company = SITE_COMPANY[name];
    const res = await fetch(`${CRM}/api/cron/competitor-prices`, {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ company, site: name, rows, lookupDone: lookupIdsFor[company] }),
    });
    log(`${name}: posted ${rows.length} rows → ${res.status} ${(await res.text()).slice(0, 120)}`);
  };

  // TGI + QTD share one browser page (Edge singleton — only one persistent
  // context at a time); every other site runs in its own context afterward.
  if (hasCreds("tgi") || hasCreds("qtd")) {
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true, channel: "msedge", viewport: { width: 1366, height: 900 } });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    try {
      for (const [name, run] of [["tgi", tgi], ["qtd", qtd]]) {
        if (!hasCreds(name)) { log(`${name}: no credentials — skipped`); continue; }
        try { await post(name, await run(page, creds[name], sizesFor.RHINO)); }
        catch (e) { log(`${name} FAILED: ${e instanceof Error ? e.message.split("\n")[0] : e}`); }
      }
    } finally { await ctx.close(); }
    await sleep(5000);
  }

  // own-context sites, run sequentially so only one Edge instance is ever up
  for (const [name, run] of [["tiredispatch", tiredispatch], ["economytire", economytire]]) {
    if (!hasCreds(name)) { log(`${name}: no credentials — skipped`); continue; }
    const company = SITE_COMPANY[name];
    try { await post(name, await run(null, creds[name], sizesFor[company])); }
    catch (e) { log(`${name} FAILED: ${e instanceof Error ? e.message.split("\n")[0] : e}`); }
    await sleep(3000);
  }
  log("competitor sync complete");
}

main().catch(e => { log(`FATAL: ${e?.stack || e}`); process.exitCode = 1; });
