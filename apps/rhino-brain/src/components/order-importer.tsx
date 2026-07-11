"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importOrders, type OrderRow } from "@/actions/order-import";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const H = {
  invoice: ["invoice", "invoice #", "invoice number", "invoice no", "inv", "inv #", "ticket", "ticket #", "order", "order #", "document", "doc", "doc #", "reference", "ref"],
  date: ["date", "invoice date", "order date", "sale date", "trans date", "transaction date", "posted date"],
  customer: ["customer", "customer name", "name", "account", "bill to", "sold to", "client"],
  total: ["total", "invoice total", "grand total", "amount", "net", "net total", "extended", "ext price", "line total", "sale total"],
};
function findCol(headers: string[], keys: string[]): string | null {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const k of keys) { const i = lower.indexOf(k); if (i !== -1) return headers[i]; }
  return null;
}
function money(v: unknown): number {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return NaN;
  if (s.startsWith("(") && s.endsWith(")")) return -Number(s.slice(1, -1));
  return Number(s);
}

type Preview = { rows: OrderRow[]; fileName: string; skipped: number; grouped: boolean };

export function OrderImporter() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const handleGrid = (grid: string[][], fileName: string) => {
    let headerIdx = -1, cInv: string | null = null, cDate: string | null = null, cCust: string | null = null, cTot: string | null = null;
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const hs = grid[i].map(String);
      const cust = findCol(hs, H.customer), tot = findCol(hs, H.total), date = findCol(hs, H.date);
      if (cust && tot && date) { headerIdx = i; cCust = cust; cTot = tot; cDate = date; cInv = findCol(hs, H.invoice); break; }
    }
    if (headerIdx === -1 || !cCust || !cTot || !cDate) {
      toast(`Could not find Customer + Date + Total columns. First row: ${(grid[0] ?? []).join(", ")}`, "error");
      return;
    }
    const header = grid[headerIdx].map(String);
    const idx = (c: string | null) => (c ? header.indexOf(c) : -1);
    const iInv = idx(cInv), iDate = idx(cDate), iCust = idx(cCust), iTot = idx(cTot);

    // group by invoice # when present (line-item files) → sum totals per invoice
    const groups = new Map<string, OrderRow>();
    const flat: OrderRow[] = [];
    let skipped = 0;
    for (const r of grid.slice(headerIdx + 1)) {
      const customerName = String(r[iCust] ?? "").trim();
      const total = money(r[iTot]);
      const dateRaw = String(r[iDate] ?? "").trim();
      const invoice = iInv !== -1 ? String(r[iInv] ?? "").trim() : "";
      const d = new Date(dateRaw);
      if (!customerName || isNaN(total) || isNaN(d.getTime())) { skipped++; continue; }
      const row: OrderRow = { invoice, customerName, date: d.toISOString(), total };
      if (invoice) {
        const g = groups.get(invoice);
        if (g) { g.total += total; } else groups.set(invoice, { ...row });
      } else flat.push(row);
    }
    const rows = [...groups.values(), ...flat];
    if (rows.length === 0) { toast("No usable order rows found.", "error"); return; }
    setPreview({ rows, fileName, skipped, grouped: groups.size > 0 });
  };

  const parse = async (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      handleGrid(grid as string[][], file.name);
    } else {
      Papa.parse(file, { header: false, skipEmptyLines: true, complete: r => handleGrid(r.data as string[][], file.name), error: () => toast("Could not read that file.", "error") });
    }
  };

  const doImport = () => start(async () => {
    if (!preview) return;
    const res = await importOrders(preview.fileName, preview.rows);
    if (res.ok) {
      toast(`Orders imported: ${res.imported} (${res.matched} matched, ${res.unmatched} unmatched customers)`);
      setPreview(null);
    } else toast(res.error ?? "Import failed", "error");
  });

  const net = preview ? preview.rows.reduce((s, r) => s + r.total, 0) : 0;

  return (
    <Card title="🧾 Order / Sales History (adds to existing orders)">
      <p className="mb-3 text-sm text-slate-500">
        Upload the Tire Guru sales / invoice export — <b>Excel or CSV</b> with <b>Customer</b>, <b>Date</b>, and <b>Total</b> columns
        (an <b>Invoice #</b> column is used to avoid duplicates and to group line items). Powers order history and at-risk detection.
        Re-uploading the same invoices updates them, so overlapping date ranges are safe.
      </p>
      <input type="file" accept=".csv,.xlsx,.xls"
        className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        onChange={e => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
      {preview && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-slate-700"><b>{preview.fileName}</b>: {preview.rows.length} orders{preview.grouped && " (line items grouped by invoice)"} · total <b>${net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>{preview.skipped > 0 && <span className="text-slate-500"> · {preview.skipped} skipped</span>}</div>
          <div className="text-xs text-slate-500">Sample: {preview.rows.slice(0, 3).map(r => `${r.customerName} $${r.total.toFixed(0)}`).join(" · ")}</div>
          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending}>{pending ? "Importing…" : `Import ${preview.rows.length} orders`}</Button>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
