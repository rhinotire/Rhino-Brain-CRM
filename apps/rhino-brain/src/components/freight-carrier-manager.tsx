"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCarrier, deleteCarrier } from "@/actions/freight";

type Contact = { id?: string; name: string | null; email: string; active: boolean };
type Carrier = { id?: string; name: string; phone: string | null; mcNumber: string | null; notes: string | null; active: boolean; equipmentTypes: ("DRY_VAN_53" | "FLATBED_53")[]; contacts: Contact[] };

const EMPTY: Carrier = { name: "", phone: null, mcNumber: null, notes: null, active: true, equipmentTypes: ["DRY_VAN_53", "FLATBED_53"], contacts: [{ name: "", email: "", active: true }] };

export function FreightCarrierManager({ carriers }: { carriers: Carrier[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Carrier | null>(null);
  const [error, setError] = useState("");

  const save = () =>
    start(async () => {
      if (!draft) return;
      setError("");
      const r = await saveCarrier({
        ...draft,
        phone: draft.phone || undefined,
        mcNumber: draft.mcNumber || undefined,
        notes: draft.notes || undefined,
        contacts: draft.contacts.filter((c) => c.email).map((c) => ({ ...c, name: c.name || undefined })),
      });
      if (!r.ok) { setError(r.error ?? "Save failed"); return; }
      setDraft(null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!draft && <button onClick={() => setDraft(EMPTY)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">+ New Carrier</button>}

      {draft && (
        <div className="space-y-2 rounded-lg border border-slate-300 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="Phone" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="MC #" value={draft.mcNumber ?? ""} onChange={(e) => setDraft({ ...draft, mcNumber: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="Notes" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          </div>
          <div className="flex gap-4 text-sm">
            {(["DRY_VAN_53", "FLATBED_53"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft.equipmentTypes.includes(t)}
                  onChange={(e) => setDraft({ ...draft, equipmentTypes: e.target.checked ? [...draft.equipmentTypes, t] : draft.equipmentTypes.filter((x) => x !== t) })} />
                {t === "DRY_VAN_53" ? "53' Dry Van" : "53' Flatbed"}
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500">Contacts (rate requests go to every contact)</p>
            {draft.contacts.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="Name" value={c.name ?? ""} onChange={(e) => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="w-36 rounded-lg border border-slate-300 p-2 text-sm" />
                <input placeholder="Email *" value={c.email} onChange={(e) => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
                <button onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })} className="px-1 text-red-400 hover:text-red-600">✕</button>
              </div>
            ))}
            <button onClick={() => setDraft({ ...draft, contacts: [...draft.contacts, { name: "", email: "", active: true }] })} className="text-xs font-semibold text-blue-600 hover:underline">+ Add contact</button>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={pending || !draft.name} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Save</button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {carriers.map((c) => (
          <div key={c.id} className={`flex items-center justify-between p-3 ${c.active ? "" : "opacity-50"}`}>
            <div>
              <p className="text-sm font-semibold">{c.name} {!c.active && <span className="text-xs">(inactive)</span>}</p>
              <p className="text-xs text-slate-500">{c.contacts.map((ct) => ct.email).join(" · ")}{c.mcNumber ? ` · MC ${c.mcNumber}` : ""}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDraft(c)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">Edit</button>
              <button onClick={() => { if (confirm(`Delete/deactivate ${c.name}?`)) start(async () => { await deleteCarrier(c.id!); router.refresh(); }); }} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
        {carriers.length === 0 && <p className="p-4 text-sm text-slate-400">No carriers yet.</p>}
      </div>
    </div>
  );
}
