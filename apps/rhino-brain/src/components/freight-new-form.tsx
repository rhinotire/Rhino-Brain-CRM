"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShipmentAndSend, previewQuoteEmail } from "@/actions/freight";

type ConsigneeOpt = { id: string; name: string; city: string; state: string };
type CarrierOpt = { id: string; name: string; contactCount: number };
type StopDraft = { consigneeId: string; quantity: string; notes: string };

const DEFAULT_ORIGIN = "11423 Satellite Blvd, Orlando, FL 32837";

export function FreightNewForm({ consignees, carriers }: { consignees: ConsigneeOpt[]; carriers: CarrierOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [originAddress, setOriginAddress] = useState(DEFAULT_ORIGIN);
  const [equipmentType, setEquipmentType] = useState<"DRY_VAN_53" | "FLATBED_53">("DRY_VAN_53");
  const [pickupDate, setPickupDate] = useState("");
  const [notes, setNotes] = useState("");
  const [stops, setStops] = useState<StopDraft[]>([{ consigneeId: "", quantity: "", notes: "" }]);
  const [carrierIds, setCarrierIds] = useState<string[]>(carriers.map((c) => c.id)); // all carriers pre-checked (owner decision)
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState("");

  const input = () => ({
    originAddress,
    originLabel: "Orlando, FL",
    equipmentType,
    pickupDate,
    commodity: "tires",
    notes: notes || undefined,
    stops: stops.filter((s) => s.consigneeId).map((s) => ({ consigneeId: s.consigneeId, quantity: s.quantity || undefined, notes: s.notes || undefined })),
    carrierIds,
  });

  const moveStop = (i: number, dir: -1 | 1) => {
    const next = [...stops];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  };

  const doPreview = () =>
    start(async () => {
      setError("");
      const r = await previewQuoteEmail(input());
      if (r.error) setError(r.error);
      else setPreview(r);
    });

  const doSend = () =>
    start(async () => {
      setError("");
      const r = await createShipmentAndSend(input());
      if (!r.ok) setError(r.error ?? "Send failed");
      else router.push(`/freight/${r.shipmentId}`);
    });

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm">Origin
          <input value={originAddress} onChange={(e) => setOriginAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-sm">Equipment
          <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value as "DRY_VAN_53" | "FLATBED_53")} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
            <option value="DRY_VAN_53">53&apos; Dry Van</option>
            <option value="FLATBED_53">53&apos; Flatbed</option>
          </select>
        </label>
        <label className="text-sm">Pickup date
          <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="col-span-2 text-sm">Notes (included in the email)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Delivery stops (in drop order)</h2>
          <button type="button" onClick={() => setStops([...stops, { consigneeId: "", quantity: "", notes: "" }])} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">+ Add stop</button>
        </div>
        {stops.map((s, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <span className="w-6 text-center text-xs font-bold text-slate-400">{i + 1}</span>
            <select value={s.consigneeId} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, consigneeId: e.target.value } : x)))} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm">
              <option value="">Select consignee…</option>
              {consignees.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.city}, {c.state})</option>)}
            </select>
            <input placeholder="Qty / weight (e.g. 250 tires)" value={s.quantity} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="w-44 rounded-lg border border-slate-300 p-2 text-sm" />
            <button type="button" onClick={() => moveStop(i, -1)} className="px-1 text-slate-400 hover:text-slate-700">↑</button>
            <button type="button" onClick={() => moveStop(i, 1)} className="px-1 text-slate-400 hover:text-slate-700">↓</button>
            <button type="button" onClick={() => setStops(stops.filter((_, j) => j !== i))} className="px-1 text-red-400 hover:text-red-600">✕</button>
          </div>
        ))}
        <p className="text-xs text-slate-400">Consignee not listed? Add it under <a href="/freight/consignees" className="text-blue-600 hover:underline">Consignees</a> first.</p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <h2 className="mb-2 text-sm font-semibold">Send to carriers (all selected by default)</h2>
        <div className="flex flex-wrap gap-3">
          {carriers.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={carrierIds.includes(c.id)} onChange={(e) => setCarrierIds(e.target.checked ? [...carrierIds, c.id] : carrierIds.filter((id) => id !== c.id))} />
              {c.name} <span className="text-xs text-slate-400">({c.contactCount} contacts)</span>
            </label>
          ))}
          {carriers.length === 0 && <p className="text-sm text-slate-400">No carriers yet — add one under <a href="/freight/carriers" className="text-blue-600 hover:underline">Carriers</a> first.</p>}
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-semibold">{preview.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-700">{preview.body}</pre>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={doPreview} disabled={pending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Preview Email</button>
        <button type="button" onClick={doSend} disabled={pending || !pickupDate || carrierIds.length === 0} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {pending ? "Sending…" : `Send Rate Requests (${carrierIds.length})`}
        </button>
      </div>
    </div>
  );
}
