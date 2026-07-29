"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveConsignee, deleteConsignee } from "@/actions/freight";

type Consignee = { id?: string; name: string; addressLine: string; city: string; state: string; zip: string; contactName: string | null; phone: string | null; deliveryNotes: string | null; active: boolean };

const EMPTY: Consignee = { name: "", addressLine: "", city: "", state: "", zip: "", contactName: null, phone: null, deliveryNotes: null, active: true };

export function FreightConsigneeManager({ consignees }: { consignees: Consignee[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Consignee | null>(null);
  const [error, setError] = useState("");

  const save = () =>
    start(async () => {
      if (!draft) return;
      setError("");
      const r = await saveConsignee({
        ...draft,
        contactName: draft.contactName || undefined,
        phone: draft.phone || undefined,
        deliveryNotes: draft.deliveryNotes || undefined,
      });
      if (!r.ok) { setError(r.error ?? "保存失败"); return; }
      setDraft(null);
      router.refresh();
    });

  const set = (patch: Partial<Consignee>) => setDraft(draft ? { ...draft, ...patch } : draft);

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!draft && <button onClick={() => setDraft(EMPTY)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">+ 新收货方</button>}

      {draft && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-300 p-3">
          <input placeholder="名称 * (如 Pearson GA – ABC Tire)" value={draft.name} onChange={(e) => set({ name: e.target.value })} className="col-span-2 rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="街道地址 *" value={draft.addressLine} onChange={(e) => set({ addressLine: e.target.value })} className="col-span-2 rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="城市 *" value={draft.city} onChange={(e) => set({ city: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          <div className="flex gap-2">
            <input placeholder="州 * (GA)" maxLength={2} value={draft.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} className="w-20 rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="ZIP *" value={draft.zip} onChange={(e) => set({ zip: e.target.value })} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
          </div>
          <input placeholder="联系人" value={draft.contactName ?? ""} onChange={(e) => set({ contactName: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="电话" value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="送货备注" value={draft.deliveryNotes ?? ""} onChange={(e) => set({ deliveryNotes: e.target.value })} className="col-span-2 rounded-lg border border-slate-300 p-2 text-sm" />
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={pending || !draft.name || !draft.addressLine || !draft.city || draft.state.length !== 2 || draft.zip.length < 5} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">保存</button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">取消</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {consignees.map((c) => (
          <div key={c.id} className={`flex items-center justify-between p-3 ${c.active ? "" : "opacity-50"}`}>
            <div>
              <p className="text-sm font-semibold">{c.name} {!c.active && <span className="text-xs">(停用)</span>}</p>
              <p className="text-xs text-slate-500">{c.addressLine}, {c.city}, {c.state} {c.zip}{c.contactName ? ` · ${c.contactName}` : ""}{c.phone ? ` ${c.phone}` : ""}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDraft(c)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">编辑</button>
              <button onClick={() => { if (confirm(`删除/停用 ${c.name}?`)) start(async () => { await deleteConsignee(c.id!); router.refresh(); }); }} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">删除</button>
            </div>
          </div>
        ))}
        {consignees.length === 0 && <p className="p-4 text-sm text-slate-400">还没有收货方。</p>}
      </div>
    </div>
  );
}
