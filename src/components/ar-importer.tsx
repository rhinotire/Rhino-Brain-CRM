"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importArInvoices, type ArRow } from "@/actions/ar-import";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

// tolerant header matching for common accounting exports (QuickBooks / Tire Guru / Excel)
const H = {
  customer: ["customer", "customer name", "name", "account", "company", "client"],
  amount: ["amount", "amt", "original amount", "invoice amount", "original amt", "open amount"],
  balance: ["balance", "open balance", "bal", "balance due", "amount due", "outstanding"],
  dueDate: ["due date", "duedate", "due", "date due"],
  daysPastDue: ["days past due", "days overdue", "aging days", "days", "past due days"],
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

export function ArImporter() {
  const [preview, setPreview] = useState<{ rows: ArRow[]; fileName: string; skipped: number } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const parse = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        const cCustomer = findCol(headers, H.customer);
        const cAmount = findCol(headers, H.amount);
        const cBalance = findCol(headers, H.balance);
        const cDue = findCol(headers, H.dueDate);
        const cDays = findCol(headers, H.daysPastDue);
        if (!cCustomer || (!cBalance && !cAmount)) {
          toast(`Could not find the needed columns. Found: ${headers.join(", ")}. Need at least Customer + Balance (or Amount).`, "error");
          return;
        }
        const rows: ArRow[] = [];
        let skipped = 0;
        for (const raw of res.data as Record<string, unknown>[]) {
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
          if (!customerName || isNaN(balance) || balance <= 0 || !dueDate) { skipped++; continue; }
          rows.push({
            customerName,
            amount: isNaN(amount) ? balance : amount,
            balance,
            dueDate: dueDate.toISOString(),
          });
        }
        if (rows.length === 0) {
          toast(`No usable rows — ${skipped} rows skipped (need customer name, positive balance, and a due date or days-past-due).`, "error");
          return;
        }
        setPreview({ rows, fileName: file.name, skipped });
      },
      error: () => toast("Could not read that file — save it as CSV and try again.", "error"),
    });
  };

  const doImport = () => start(async () => {
    if (!preview) return;
    const res = await importArInvoices(preview.fileName, preview.rows);
    if (res.ok) {
      toast(`A/R updated: ${res.imported} invoices imported, ${res.matched} matched to customers`);
      setPreview(null);
    } else toast(res.error ?? "Import failed", "error");
  });

  return (
    <Card title="💰 A/R Aging Report (replaces current A/R data)">
      <p className="mb-3 text-sm text-slate-500">
        Upload the open-invoices / A/R aging CSV from your accounting system. Needs columns for <b>Customer</b>,{" "}
        <b>Balance</b> (or Amount), and <b>Due Date</b> (or Days Past Due). Each upload replaces the previous A/R snapshot.
      </p>
      <input type="file" accept=".csv,text/csv"
        className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        onChange={e => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
      {preview && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-slate-700">
            <b>{preview.fileName}</b>: {preview.rows.length} open invoices ready
            {preview.skipped > 0 && <span className="text-slate-500"> · {preview.skipped} rows skipped (zero balance / missing data)</span>}
          </div>
          <div className="text-xs text-slate-500">
            Sample: {preview.rows.slice(0, 3).map(r => `${r.customerName} $${r.balance.toFixed(2)}`).join(" · ")}
          </div>
          <div className="text-xs font-medium text-amber-700">⚠ This will replace ALL current A/R invoices with this file.</div>
          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending}>{pending ? "Importing…" : `Replace A/R with ${preview.rows.length} invoices`}</Button>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
