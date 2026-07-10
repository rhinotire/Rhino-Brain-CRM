"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importCustomerMaster, type MasterRow } from "@/actions/customer-import";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const H = {
  custNo: ["cust#", "cust #", "customer #", "customer number", "account #", "account number", "id"],
  name: ["name", "customer", "customer name", "company", "company name"],
  addr1: ["address1", "address 1", "address", "street"],
  addr2: ["address2", "address 2"],
  city: ["city"], state: ["state", "st"], zip: ["zip", "zip code", "postal", "postal code"],
  phone: ["business phone", "phone", "phone number", "main phone", "work phone"],
  cell: ["cell phone", "cell", "mobile", "mobile phone"],
  email: ["email address - receipts", "email", "email address", "e-mail"],
  terms: ["a/r terms", "ar terms", "terms", "payment terms"],
  credit: ["credit limit", "credit"],
  sales: ["salesperson", "sales rep", "rep", "sales person"],
  group: ["group", "customer group", "category", "type"],
};
function findCol(hs: string[], keys: string[]): number {
  const lower = hs.map(h => h.trim().toLowerCase());
  for (const k of keys) { const i = lower.indexOf(k); if (i !== -1) return i; }
  return -1;
}

type Preview = { rows: MasterRow[]; fileName: string };

export function CustomerMasterImporter() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const handleGrid = (grid: string[][], fileName: string) => {
    let hi = -1;
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const hs = grid[i].map(String);
      if (findCol(hs, H.name) !== -1 && (findCol(hs, H.phone) !== -1 || findCol(hs, H.custNo) !== -1)) { hi = i; break; }
    }
    if (hi === -1) { toast(`Could not find a Name column. First row: ${(grid[0] ?? []).join(", ")}`, "error"); return; }
    const hs = grid[hi].map(String);
    const c = {
      custNo: findCol(hs, H.custNo), name: findCol(hs, H.name), addr1: findCol(hs, H.addr1), addr2: findCol(hs, H.addr2),
      city: findCol(hs, H.city), state: findCol(hs, H.state), zip: findCol(hs, H.zip), phone: findCol(hs, H.phone),
      cell: findCol(hs, H.cell), email: findCol(hs, H.email), terms: findCol(hs, H.terms), credit: findCol(hs, H.credit),
      sales: findCol(hs, H.sales), group: findCol(hs, H.group),
    };
    const g = (r: string[], i: number) => (i === -1 ? "" : String(r[i] ?? "").trim());
    const rows: MasterRow[] = [];
    for (const r of grid.slice(hi + 1)) {
      const name = g(r, c.name);
      if (!name) continue;
      rows.push({
        custNo: g(r, c.custNo), name,
        address: [g(r, c.addr1), g(r, c.addr2)].filter(Boolean).join(", "),
        city: g(r, c.city), state: g(r, c.state), zip: g(r, c.zip),
        phone: g(r, c.phone), cell: g(r, c.cell), email: g(r, c.email),
        terms: g(r, c.terms), credit: g(r, c.credit), salesperson: g(r, c.sales), group: g(r, c.group),
      });
    }
    if (rows.length === 0) { toast("No customer rows found.", "error"); return; }
    setPreview({ rows, fileName });
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
    const res = await importCustomerMaster(preview.fileName, preview.rows);
    if (res.ok) { toast(`Customers updated: ${res.updated} updated, ${res.created} added`); setPreview(null); }
    else toast(res.error ?? "Import failed", "error");
  });

  return (
    <Card title="🏬 Customer Master List (Excel/CSV — updates + adds)">
      <p className="mb-3 text-sm text-slate-500">
        Upload the Tire Guru <b>Customer Master List</b> (Excel or CSV). Existing customers are matched by customer #, phone, or
        name and their details refreshed (phone, address, terms, credit limit, salesperson, type); new customers are added.
        Nothing is deleted.
      </p>
      <input type="file" accept=".csv,.xlsx,.xls"
        className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        onChange={e => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
      {preview && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-slate-700"><b>{preview.fileName}</b>: {preview.rows.length} customers ready</div>
          <div className="text-xs text-slate-500">Sample: {preview.rows.slice(0, 3).map(r => r.name.slice(0, 40)).join(" · ")}</div>
          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending}>{pending ? "Importing…" : `Import ${preview.rows.length} customers`}</Button>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
