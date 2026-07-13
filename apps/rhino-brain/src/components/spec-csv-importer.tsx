"use client";

import { useState } from "react";
import { importSpecCsv, type SpecCsvRow } from "@/actions/spec-review";

const SPEC_COLUMNS = ["loadRange", "plyRating", "position", "treadType", "construction", "loadIndex", "speedRating", "application", "mileageWarrantyMiles"];

/** Upload the filled-in gap sheet (CSV/Excel). Matches columns by header name. */
export function SpecCsvImporter() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [badCells, setBadCells] = useState<string[]>([]);

  const onFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    setBadCells([]);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      if (grid.length < 2) { setResult("File has no data rows."); return; }

      const header = grid[0].map((h) => String(h).trim());
      const skuIdx = header.findIndex((h) => h.toLowerCase() === "sku");
      if (skuIdx === -1) { setResult('No "sku" column found — use the exported gap sheet as the template.'); return; }
      const colIdx: Record<string, number> = {};
      for (const c of SPEC_COLUMNS) {
        const i = header.findIndex((h) => h === c);
        if (i > -1) colIdx[c] = i;
      }
      if (Object.keys(colIdx).length === 0) { setResult("No spec columns found — keep the exported header row unchanged."); return; }

      const rows: SpecCsvRow[] = grid.slice(1)
        .filter((r) => String(r[skuIdx] ?? "").trim())
        .map((r) => ({
          sku: String(r[skuIdx]).trim(),
          values: Object.fromEntries(Object.entries(colIdx).map(([c, i]) => [c, String(r[i] ?? "").trim()])),
        }));

      const res = await importSpecCsv(file.name, rows);
      if (res.error) setResult(res.error);
      else {
        setResult(`Imported: ${res.updated} products updated, ${res.unknownSkus} unknown SKUs skipped${res.badCells?.length ? `, ${res.badCells.length}+ invalid cells rejected` : ""}.`);
        setBadCells(res.badCells ?? []);
      }
    } catch (e) {
      setResult(`Could not read file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 text-sm font-semibold">Import filled gap sheet</div>
      <p className="mb-2 text-xs text-slate-500">
        Export the gap sheet, fill the empty cells (from supplier data sheets), and upload it back — CSV or Excel.
        Values are validated; invalid cells are rejected and reported.
      </p>
      <input
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700"
      />
      {busy && <p className="mt-2 text-sm text-slate-500">Importing…</p>}
      {result && <p className="mt-2 text-sm text-slate-700">{result}</p>}
      {badCells.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs text-red-600">
          {badCells.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </div>
  );
}
