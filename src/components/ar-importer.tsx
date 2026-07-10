"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importArInvoices, type ArRow } from "@/actions/ar-import";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

// tolerant header matching for per-invoice exports (QuickBooks / Excel)
const H = {
  customer: ["customer", "customer name", "name", "account", "company", "client"],
  amount: ["amount", "amt", "original amount", "invoice amount", "original amt", "open amount"],
  balance: ["balance", "open balance", "bal", "balance due", "amount due", "outstanding"],
  dueDate: ["due date", "duedate", "due", "date due"],
  daysPastDue: ["days past due", "days overdue", "aging days", "days", "past due days"],
  phone: ["phone", "phone numbers", "business phone", "phones"],
};

function findCol(headers: string[], keys: string[]): string | null {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const k of keys) {
    const i = lower.indexOf(k);
    if (i !== -1) return headers[i];
  }
  return null;
}

function money(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return NaN;
  if (s.startsWith("(") && s.endsWith(")")) return -Number(s.slice(1, -1));
  return Number(s);
}

const phonesIn = (s: string) => (s.match(/\d[\d\-\s().]{8,}\d/g) ?? []).map(x => x.replace(/\D/g, "").slice(-10)).filter(x => x.length === 10);

type Preview = { rows: ArRow[]; fileName: string; skipped: number; format: string };

/** Per-invoice format: one row per open invoice with customer/balance/due date. */
function mapInvoiceRows(records: Record<string, unknown>[], headers: string[]): { rows: ArRow[]; skipped: number } | { error: string } {
  const cCustomer = findCol(headers, H.customer);
  const cAmount = findCol(headers, H.amount);
  const cBalance = findCol(headers, H.balance);
  const cDue = findCol(headers, H.dueDate);
  const cDays = findCol(headers, H.daysPastDue);
  const cPhone = findCol(headers, H.phone);
  if (!cCustomer || (!cBalance && !cAmount)) {
    return { error: `Could not find the needed columns. Found: ${headers.join(", ")}. Need at least Customer + Balance (or Amount).` };
  }
  const rows: ArRow[] = [];
  let skipped = 0;
  for (const raw of records) {
    const customerName = String(raw[cCustomer] ?? "").trim();
    const balance = money(cBalance ? raw[cBalance] : raw[cAmount!]);
    const amount = cAmount ? money(raw[cAmount]) : balance;
    let dueDate: Date | null = null;
    if (cDue && raw[cDue]) {
      const d = new Date(String(raw[cDue]));
      if (!isNaN(d.getTime())) dueDate = d;
    }
    if (!dueDate && cDays && raw[cDays] !== undefined && raw[cDays] !== "") {
      const days = Number(String(raw[cDays]).replace(/[^\d.-]/g, ""));
      if (!isNaN(days)) dueDate = new Date(Date.now() - days * 86400000);
    }
    if (!customerName || isNaN(balance) || balance === 0 || !dueDate) { skipped++; continue; }
    rows.push({
      customerName,
      amount: isNaN(amount) ? balance : amount,
      balance,
      dueDate: dueDate.toISOString(),
      phones: cPhone ? phonesIn(String(raw[cPhone] ?? "")) : undefined,
    });
  }
  return { rows, skipped };
}

/** Tire Guru "Customer Aged Trial Balance": one row per customer with aging-bucket columns. */
function mapTrialBalance(grid: string[][]): { rows: ArRow[]; skipped: number } | null {
  const headerIdx = grid.findIndex(r =>
    String(r[0] ?? "").trim().toLowerCase() === "customer" &&
    r.some(c => String(c).trim().toLowerCase() === "current"));
  if (headerIdx === -1) return null;

  let cutoff = new Date();
  for (const r of grid.slice(0, headerIdx)) {
    const m = String(r[0] ?? "").match(/Cut-?Off date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m) { const d = new Date(m[1]); if (!isNaN(d.getTime())) cutoff = d; break; }
  }

  const header = grid[headerIdx].map(c => String(c).trim().toLowerCase());
  const col = (label: string) => header.indexOf(label);
  const buckets: { col: number; offsetDays: number }[] = [
    { col: col("future"), offsetDays: +14 },
    { col: col("current"), offsetDays: -15 },
    { col: col("31-60"), offsetDays: -45 },
    { col: col("61-90"), offsetDays: -75 },
    { col: col("91-120"), offsetDays: -105 },
    { col: col("120+"), offsetDays: -150 },
  ].filter(b => b.col !== -1);
  const phoneCol = header.findIndex(h => h.includes("phone"));

  const rows: ArRow[] = [];
  let skipped = 0;
  for (const r of grid.slice(headerIdx + 1)) {
    const name = String(r[0] ?? "").trim();
    if (!name || name.toUpperCase().startsWith("TOTALS")) { if (name) skipped++; continue; }
    const phones = phoneCol !== -1 ? phonesIn(String(r[phoneCol] ?? "")) : undefined;
    let any = false;
    for (const b of buckets) {
      const bal = money(r[b.col]);
      if (!bal || isNaN(bal)) continue;
      any = true;
      rows.push({
        customerName: name,
        amount: bal,
        balance: bal,
        dueDate: new Date(cutoff.getTime() + b.offsetDays * 86400000).toISOString(),
        phones,
      });
    }
    if (!any) skipped++;
  }
  return { rows, skipped };
}

export function ArImporter() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const handleGrid = (grid: string[][], fileName: string) => {
    // 1. Tire Guru aged trial balance?
    const tb = mapTrialBalance(grid);
    if (tb) {
      if (tb.rows.length === 0) { toast("Recognized an aged trial balance but found no non-zero balances.", "error"); return; }
      setPreview({ ...tb, fileName, format: "Aged Trial Balance (per-customer buckets)" });
      return;
    }
    // 2. Fall back to per-invoice format: first row = headers
    const headers = (grid[0] ?? []).map(String);
    const records = grid.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    const res = mapInvoiceRows(records, headers);
    if ("error" in res) { toast(res.error, "error"); return; }
    if (res.rows.length === 0) { toast(`No usable rows — ${res.skipped} skipped.`, "error"); return; }
    setPreview({ ...res, fileName, format: "Open invoices list" });
  };

  const parse = async (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      handleGrid(grid as string[][], file.name);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: res => handleGrid(res.data as string[][], file.name),
        error: () => toast("Could not read that file.", "error"),
      });
    }
  };

  const doImport = () => start(async () => {
    if (!preview) return;
    const res = await importArInvoices(preview.fileName, preview.rows);
    if (res.ok) {
      toast(`A/R updated: ${res.imported} entries imported, ${res.matched} customers matched`);
      setPreview(null);
    } else toast(res.error ?? "Import failed", "error");
  });

  const net = preview ? preview.rows.reduce((s, r) => s + r.balance, 0) : 0;

  return (
    <Card title="💰 A/R Aging Report (replaces current A/R data)">
      <p className="mb-3 text-sm text-slate-500">
        Upload the A/R report straight from your accounting system — <b>Excel (.xlsx) or CSV</b>. Two formats are recognized
        automatically: the Tire Guru <b>Customer Aged Trial Balance</b> (per-customer aging buckets) and a plain open-invoices
        list (Customer + Balance + Due Date). Each upload replaces the previous A/R snapshot.
      </p>
      <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        onChange={e => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
      {preview && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-slate-700">
            <b>{preview.fileName}</b> · detected format: <b>{preview.format}</b>
          </div>
          <div className="text-sm text-slate-700">
            {preview.rows.length} entries · net total <b>${net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            {preview.skipped > 0 && <span className="text-slate-500"> · {preview.skipped} rows skipped</span>}
          </div>
          <div className="text-xs text-slate-500">
            Sample: {preview.rows.slice(0, 3).map(r => `${r.customerName} $${r.balance.toFixed(2)}`).join(" · ")}
          </div>
          <div className="text-xs font-medium text-amber-700">⚠ This will replace ALL current A/R data with this file.</div>
          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending}>{pending ? "Importing…" : `Replace A/R (${preview.rows.length} entries)`}</Button>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
