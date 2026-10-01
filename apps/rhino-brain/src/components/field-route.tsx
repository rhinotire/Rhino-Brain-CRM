"use client";

import { useState } from "react";
import Link from "next/link";
import { QuickLogButton } from "@/components/quick-log";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/domain";

export type FieldCard = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  tier: string;
  owed: number;
  daysSinceOrder: number | null;
  openQuotes: number;
  reason: { kind: "task" | "followup" | "cold"; label: string };
};

const REASON_STYLE = {
  task: "bg-red-100 text-red-700",
  followup: "bg-amber-100 text-amber-800",
  cold: "bg-slate-100 text-slate-600",
};
const REASON_ICON = { task: "📋", followup: "⏰", cold: "💤" };

const navUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

export function FieldList({ cards }: { cards: FieldCard[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= 9 ? s : [...s, id]));

  const routeStops = selected
    .map(id => cards.find(c => c.id === id))
    .filter((c): c is FieldCard => !!c?.address);
  const routeUrl = routeStops.length
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeStops[routeStops.length - 1]!.address!)}${
        routeStops.length > 1
          ? `&waypoints=${routeStops.slice(0, -1).map(c => encodeURIComponent(c.address!)).join("%7C")}`
          : ""
      }`
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-24">
      <div>
        <h1 className="text-xl font-bold">🧭 Field Mode <span className="text-sm font-normal text-slate-400">({cards.length} to visit)</span></h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Tap ☐ to build today&apos;s route (max 9 stops, in tap order) · 🧭 navigates to one store · 📍 logs the visit with GPS check-in.
        </p>
      </div>

      {cards.length === 0 && (
        <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-8 text-center text-sm text-emerald-700">
          Nothing due — every account is covered. 🎉
        </div>
      )}

      {cards.map(c => (
        <div key={c.id} className={`rounded-lg border bg-white p-3 shadow-sm ${selected.includes(c.id) ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200"}`}>
          <div className="flex items-start gap-2.5">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={selected.includes(c.id)} onChange={() => toggle(c.id)}
              disabled={!c.address && !selected.includes(c.id)} title={c.address ? "Add to route" : "No address on file"} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={`/customers/${c.id}`} className="truncate font-semibold text-brand-700 hover:underline">{c.name}</Link>
                <Badge className="bg-slate-100 text-slate-500">Tier {c.tier}</Badge>
                {selected.includes(c.id) && <Badge className="bg-brand-100 text-brand-700">stop #{selected.indexOf(c.id) + 1}</Badge>}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-medium ${REASON_STYLE[c.reason.kind]}`}>
                  {REASON_ICON[c.reason.kind]} {c.reason.label}
                </span>
              </div>
              {/* the three numbers to know before walking in */}
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                <span className={c.owed > 0 ? "font-semibold text-red-600" : ""}>
                  {c.owed > 0 ? `Owes ${fmtMoney(c.owed)}` : "No balance due"}
                </span>
                <span>{c.daysSinceOrder === null ? "No orders yet" : `Last order ${c.daysSinceOrder}d ago`}</span>
                {c.openQuotes > 0 && <span className="font-medium text-amber-700">{c.openQuotes} open quote{c.openQuotes > 1 ? "s" : ""}</span>}
              </div>
              {c.address && <div className="mt-1 truncate text-xs text-slate-400">{c.address}</div>}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            {c.address && (
              <a href={navUrl(c.address)} target="_blank" rel="noopener"
                className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">
                🧭 Navigate
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">
                📞 Call
              </a>
            )}
            <div className="flex-1">
              <QuickLogButton customerId={c.id} defaultType="VISIT" label="📍 Log Visit" size="sm" variant="primary" />
            </div>
          </div>
        </div>
      ))}

      {/* sticky route bar */}
      {selected.length > 0 && routeUrl && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span className="text-sm text-slate-600">{routeStops.length} stop{routeStops.length > 1 ? "s" : ""} selected</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelected([])}>Clear</Button>
              <a href={routeUrl} target="_blank" rel="noopener"
                className="inline-flex h-8 items-center rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
                🗺️ Open route in Google Maps
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
