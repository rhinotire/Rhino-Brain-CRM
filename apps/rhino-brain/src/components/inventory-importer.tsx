"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importInventory, type InvRow } from "@/actions/inventory-import";
import { Button, Card, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const H = {
  sku: ["sku", "item", "item #", "item number", "product", "product code", "part", "part number", "part #"],
  qty: ["qty", "quantity", "qty on hand", "on hand", "quantity on hand", "stock", "available", "qoh"],
};

function findCol(headers: string[], keys: string[]): string | null {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const k of keys) { const i = lower.indexOf(k); if (i !== -1) return headers[i]; }
  return null;
}
function num(v: unknown): number {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

type Preview = { rows: InvRow[]; fileName: string; skipped: number };

export function InventoryImporter({ locations }: { locations: { id: string; name: string; shortTag: string }[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const handleGrid = (grid: string[][], fileName: string) => {
    // find the header row (first row containing an SKU-ish and a qty-ish column)
    let headerIdx = -1, cSku: string | null = null, cQty: string | null = null;
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const hs = grid[i].map(String);
      const s = findCol(hs, H.sku), q = findCol(hs, H.qty);
      if (s && q) { headerIdx = i; cSku = s; cQty = q; break; }
    }
    if (headerIdx === -1 || !cSku || !cQty) {
      toast(`Could not find SKU + Quantity columns. First row: ${(grid[0] ?? []).join(", ")}`, "error");
      return;
    }
    const header = grid[headerIdx].map(String);
    const iSku = header.indexOf(cSku), iQty = header.indexOf(cQty);
    const rows: InvRow[] = [];
    let skipped = 0;
    for (const r of grid.slice(headerIdx + 1)) {
      const sku = String(r[iSku] ?? "").trim();
      const quantity = num(r[iQty]);
      if (!sku || isNaN(quantity)) { skipped++; continue; }
      rows.push({ sku, quantity });
    }
    if (rows.length === 0) { toast("No usable stock rows found.", "error"); return; }
    setPreview({ rows, fileName, skipped });
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
    const res = await importInventory(preview.fileName, locationId, preview.rows);
    if (res.ok) {
      toast(`Stock updated: ${res.matched} SKUs set${res.unknown ? `, ${res.unknown} unknown skipped` : ""}`);
      setPreview(null);
    } else toast(res.error ?? "Import failed", "error");
  });

  const locName = locations.find(l => l.id === locationId)?.name ?? "";

  return (
    <Card title="📦 Inventory / Stock (replaces one warehouse's stock)">
      <p className="mb-3 text-sm text-slate-500">
        Upload the on-hand stock export from Tire Guru — <b>Excel or CSV</b> with an <b>SKU</b> column and a <b>Quantity</b> column.
        Pick the warehouse first. Uploading sets that warehouse&apos;s stock to the file (SKUs not in the file become 0).
      </p>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Warehouse:</span>
        <Select value={locationId} onChange={e => setLocationId(e.target.value)} className="w-64">
          {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>)}
        </Select>
      </div>
      <input type="file" accept=".csv,.xlsx,.xls" disabled={!locationId}
        className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        onChange={e => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
      {preview && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-slate-700"><b>{preview.fileName}</b>: {preview.rows.length} stock rows for <b>{locName}</b>{preview.skipped > 0 && <span className="text-slate-500"> · {preview.skipped} skipped</span>}</div>
          <div className="text-xs text-slate-500">Sample: {preview.rows.slice(0, 4).map(r => `${r.sku}=${r.quantity}`).join(" · ")}</div>
          <div className="text-xs font-medium text-amber-700">⚠ Replaces ALL stock for {locName}. Other warehouses are untouched.</div>
          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending}>{pending ? "Updating…" : `Update ${locName} stock`}</Button>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
