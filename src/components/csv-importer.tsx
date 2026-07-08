"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importCustomers, type CsvCustomerRow } from "@/actions/customers";
import { importLeads, type CsvLeadRow } from "@/actions/leads";
import { Button, Card, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

type Entity = "customers" | "leads";

export function CsvImporter() {
  const [entity, setEntity] = useState<Entity>("customers");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const onFile = (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    // Normalize headers: "Company Name" / company_name → companyName
    const toCamel = (h: string) => {
      const parts = h.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const key = parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("");
      const aliases: Record<string, string> = {
        company: "companyName", name: "companyName", contact: "contactPerson",
        interest: "mainInterest", productInterest: "mainInterest", mainInterest: "mainInterest",
        telephone: "phone", zipCode: "zip",
      };
      return aliases[key] ?? key;
    };
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: toCamel,
      complete: res => setRows(res.data),
      error: () => toast("Could not parse that file — is it a valid CSV?", "error"),
    });
  };

  const run = () => start(async () => {
    const res = entity === "customers"
      ? await importCustomers(rows as unknown as CsvCustomerRow[], fileName)
      : await importLeads(rows as unknown as CsvLeadRow[], fileName);
    if (res.ok) {
      setResult({ imported: res.imported, failed: res.failed });
      toast(`Imported ${res.imported} ${entity}${res.failed ? `, ${res.failed} skipped` : ""}`);
      setRows([]);
      router.refresh();
    } else toast(res.error ?? "Import failed", "error");
  });

  const preview = rows.slice(0, 5);
  const headers = preview.length ? Object.keys(preview[0]) : [];

  return (
    <Card title="CSV Import">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={entity} onChange={e => { setEntity(e.target.value as Entity); setRows([]); setResult(null); }} className="w-40">
            <option value="customers">Customers</option>
            <option value="leads">Leads</option>
          </Select>
          <input
            type="file" accept=".csv,text/csv"
            onChange={e => onFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
          {rows.length > 0 && (
            <Button onClick={run} disabled={pending}>
              {pending ? "Importing…" : `Import ${rows.length} rows`}
            </Button>
          )}
        </div>

        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-600">Expected columns ({entity}):</p>
          {entity === "customers"
            ? <p>company_name (required), contact_person, phone, email, address, city, state, zip, type, source, interest, tier, status</p>
            : <p>company_name (required), contact_person, phone, email, city, state</p>}
          <p className="mt-1">Type: Tire Shop / Car Dealer / Fleet / Trailer Manufacturer / Wholesale Dealer. Interest: PCR / LT / ST Trailer / TBR / Wheels / Trailer Parts / Oil &amp; Lubricants. Unrecognized values fall back to sensible defaults; rows without a company name are skipped.</p>
        </div>

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>{headers.map(h => <th key={h} className="px-2 py-1.5 font-semibold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {headers.map(h => <td key={h} className="px-2 py-1.5 text-slate-600">{r[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && <p className="px-2 py-1.5 text-xs text-slate-400">…and {rows.length - 5} more rows</p>}
          </div>
        )}

        {result && (
          <p className="text-sm font-medium text-emerald-700">
            ✓ Imported {result.imported} rows{result.failed > 0 && `, skipped ${result.failed} (missing company name or invalid data)`}.
          </p>
        )}
      </div>
    </Card>
  );
}
