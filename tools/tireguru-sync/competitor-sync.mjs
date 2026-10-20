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
const PROFILE_DIR = join(homedir(), ".competitor-sync-profile");
const CRED_FILE = join(homedir(), ".competitor-sync.json");
const SYNC_CFG = JSON.parse(readFileSync(join(homedir(), ".tireguru-sync.json"), "utf8").replace(/^﻿/, ""));
const CRM = SYNC_CFG.crmBase || "https://rhino-brain-crm.vercel.app";
const AUTH = { authorization: `Bearer ${SYNC_CFG.cronSecret}` };

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

async function main() {
  const creds = JSON.parse(readFileSync(CRED_FILE, "utf8").replace(/^﻿/, ""));
  let sizes, lookupIds = [];
  if (PENDING_MODE) {
    // on-demand queue from the /competitors search box — exit fast when empty
    const r = await fetch(`${CRM}/api/cron/competitor-prices?pending=1`, { headers: AUTH });
    if (!r.ok) throw new Error(`pending fetch ${r.status}`);
    const { lookups } = await r.json();
    if (!lookups.length) { console.log("no pending lookups"); return; }
    sizes = lookups;
    lookupIds = lookups.map(l => l.id);
    log(`pending lookups: ${sizes.map(s => s.display).join(", ")}`);
  } else {
    const wl = await fetch(`${CRM}/api/cron/competitor-prices`, { headers: AUTH });
    if (!wl.ok) throw new Error(`watchlist fetch ${wl.status}`);
    sizes = (await wl.json()).sizes;
    log(`watchlist: ${sizes.length} sizes`);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true, channel: "msedge", viewport: { width: 1366, height: 900 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    const sites = [["tgi", tgi]]; // qtd / tiredispatch: to be mapped
    for (const [name, run] of sites) {
      if (!creds[name]?.username || creds[name].username === "FILL_ME") { log(`${name}: no credentials — skipped`); continue; }
      try {
        const rows = await run(page, creds[name], sizes);
        const res = await fetch(`${CRM}/api/cron/competitor-prices`, {
          method: "POST",
          headers: { ...AUTH, "content-type": "application/json" },
          body: JSON.stringify({ site: name, rows, lookupDone: lookupIds }),
        });
        log(`${name}: posted ${rows.length} rows → ${res.status} ${(await res.text()).slice(0, 120)}`);
      } catch (e) {
        log(`${name} FAILED: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    }
  } finally {
    await ctx.close();
  }
  log("competitor sync complete");
}

main().catch(e => { log(`FATAL: ${e?.stack || e}`); process.exitCode = 1; });
