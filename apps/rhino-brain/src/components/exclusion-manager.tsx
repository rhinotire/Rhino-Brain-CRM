"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExclusionEntry, removeExclusion } from "@/actions/prospecting";

type Row = {
  id: string; kind: string; companyName: string;
  domain: string | null; phone: string | null; reason: string | null; createdAt: string;
};

const KINDS = [
  { value: "EXISTING_CUSTOMER", label: "Existing customer" },
  { value: "AGENT", label: "Agent / partner" },
  { value: "COMPETITOR", label: "Competitor" },
  { value: "RISK", label: "Risk / not a target" },
  { value: "OPTED_OUT", label: "Opted out" },
] as const;

const KIND_COLORS: Record<string, string> = {
  EXISTING_CUSTOMER: "bg-emerald-100 text-emerald-800",
  AGENT: "bg-blue-100 text-blue-800",
  COMPETITOR: "bg-red-100 text-red-800",
  RISK: "bg-amber-100 text-amber-800",
  OPTED_OUT: "bg-slate-200 text-slate-600",
};

export function ExclusionManager({ rows, isAdmin }: { rows: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<string>("COMPETITOR");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  const add = () =>
    start(async () => {
      const r = await addExclusionEntry({
        kind: kind as "COMPETITOR", companyName: name, website: website || undefined,
        phone: phone || undefined, reason: reason || undefined,
      });
      if (!r.ok) { setMessage(`❌ ${r.error}`); return; }
      setMessage(`✓ ${name} is now protected`);
      setName(""); setWebsite(""); setPhone(""); setReason("");
      router.refresh();
    });

  const remove = (id: string, companyName: string) =>
    start(async () => {
      if (!window.confirm(`Remove protection for "${companyName}"? Collectors and future outreach will be able to touch it again.`)) return;
      const r = await removeExclusion(id);
      setMessage(r.ok ? `✓ Removed ${companyName}` : `❌ ${r.error}`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500">Company name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-500">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button onClick={add} disabled={pending || !name.trim()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          🛡 Protect
        </button>
        {message && <p className="w-full text-sm text-slate-600">{message}</p>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Reason</th>
              {isAdmin && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-1.5 font-semibold text-slate-800">{r.companyName}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${KIND_COLORS[r.kind] ?? "bg-slate-100"}`}>{r.kind}</span>
                </td>
                <td className="px-3 py-1.5 text-slate-500">{r.domain ?? "—"}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.phone ?? "—"}</td>
                <td className="px-3 py-1.5 text-xs text-slate-500">{r.reason ?? "—"}</td>
                {isAdmin && (
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => remove(r.id, r.companyName)} disabled={pending} className="text-xs text-red-500 hover:underline disabled:opacity-50">remove</button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-400">No matches</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
