"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { QuickLogButton } from "@/components/quick-log";
import { FieldAsk } from "@/components/field-ask";
import { searchFieldCustomers, createFieldProspect, optimizeRoute, saveFieldRoute, type FieldSearchHit } from "@/actions/field";
import { draftVisitBrief } from "@/actions/ai";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { fmtMoney } from "@/lib/domain";

export type FieldCard = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  tier: string;
  owed: number;
  daysSinceOrder: number | null;
  openQuotes: number;
  reason: { kind: "task" | "followup" | "cold" | "added" | "new"; label: string };
};

const REASON_STYLE: Record<FieldCard["reason"]["kind"], string> = {
  task: "bg-red-100 text-red-700",
  followup: "bg-amber-100 text-amber-800",
  cold: "bg-slate-100 text-slate-600",
  added: "bg-sky-100 text-sky-700",
  new: "bg-emerald-100 text-emerald-700",
};
const REASON_ICON: Record<FieldCard["reason"]["kind"], string> = {
  task: "📋", followup: "⏰", cold: "💤", added: "➕", new: "✨",
};

const navUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

/** Pre-visit AI brief: what to know before walking in. */
function BriefButton({ customerId, name }: { customerId: string; name: string }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const load = () => start(async () => {
    const r = await draftVisitBrief(customerId);
    if (r.ok && r.brief) setBrief(r.brief);
    else toast(r.error ?? "Brief failed", "error");
  });
  return (
    <>
      <button type="button" onClick={load} disabled={pending}
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {pending ? "…" : "🧠"}
      </button>
      {brief && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setBrief(null)}>
          <div className="w-full max-w-md rounded-t-xl bg-white p-4 shadow-xl sm:rounded-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-2 text-sm font-semibold text-slate-800">🧠 Before you walk into {name}</div>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-700">{brief}</pre>
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => setBrief(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Drive-by prospect modal: name + phone + GPS → customer created + visit logged. */
function NewProspectButton({ onCreated }: { onCreated: (c: FieldCard) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [loc, setLoc] = useState("");
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const grab = () => {
    if (!navigator.geolocation) { toast("No location service on this device", "error"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLoc(`https://maps.google.com/?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)} (±${Math.round(p.coords.accuracy)}m)`); setLocating(false); toast("Location captured"); },
      () => { setLocating(false); toast("Could not get location — allow location access", "error"); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const save = () => start(async () => {
    const r = await createFieldProspect({ name, phone, city, notes, visitLocation: loc });
    if (r.ok && r.customerId) {
      toast("Prospect created — visit logged ✓");
      onCreated({
        id: r.customerId, name: name.trim(), contact: null, phone: phone.trim() || null,
        address: city.trim() || null, city: city.trim() || null, zip: null, tier: "D",
        owed: 0, daysSinceOrder: null, openQuotes: 0,
        reason: { kind: "new", label: "New prospect — just created" },
      });
      setOpen(false); setName(""); setPhone(""); setCity(""); setNotes(""); setLoc("");
    } else toast(r.error ?? "Failed", "error");
  });

  return (
    <>
      <Button variant="success" onClick={() => setOpen(true)}>➕ New Prospect</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-xl bg-white p-4 shadow-xl sm:rounded-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-2 text-sm font-semibold text-slate-800">✨ New prospect — standing at the store?</div>
            <div className="space-y-2.5">
              <Input placeholder="Store name *" value={name} onChange={e => setName(e.target.value)} autoFocus />
              <div className="grid grid-cols-2 gap-2.5">
                <Input placeholder="Phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                <Input placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <Input placeholder="Quick note (who you met, what they buy…)" value={notes} onChange={e => setNotes(e.target.value)} />
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm">
                {loc ? (
                  <span className="text-emerald-800">📍 Location captured · <a className="underline" href={loc.split(" ")[0]} target="_blank" rel="noopener">map</a></span>
                ) : (
                  <button type="button" onClick={grab} disabled={locating} className="font-medium text-emerald-700">
                    {locating ? "Getting location…" : "📍 Capture store location"}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={pending || name.trim().length < 2}>
                {pending ? "Saving…" : "Create & log visit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Search any of my customers and add them as a stop. */
function AddStopSearch({ onAdd, existing }: { onAdd: (c: FieldCard) => void; existing: string[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FieldSearchHit[]>([]);
  const [, start] = useTransition();

  const run = (v: string) => {
    setQ(v);
    if (v.trim().length < 2) { setHits([]); return; }
    start(async () => setHits(await searchFieldCustomers(v)));
  };

  return (
    <div className="relative">
      <Input placeholder="🔍 Add any customer to today's list — name, city or phone…" value={q} onChange={e => run(e.target.value)} />
      {hits.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {hits.map(h => (
            <button key={h.id} type="button" disabled={existing.includes(h.id)}
              onClick={() => {
                onAdd({ ...h, city: null, reason: { kind: "added", label: "Added by you" } });
                setQ(""); setHits([]);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
              <span className="truncate font-medium text-slate-800">{h.name}</span>
              <span className="ml-2 shrink-0 text-xs text-slate-400">{existing.includes(h.id) ? "already listed" : h.address?.split(",").slice(-3, -1).join(",") ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldList({ cards: initial, initialSelected = [], initialExtra = [], initialMiles = null, aiReady = false }: {
  cards: FieldCard[];
  initialSelected?: string[];
  initialExtra?: FieldCard[];
  initialMiles?: number | null;
  aiReady?: boolean;
}) {
  const [extra, setExtra] = useState<FieldCard[]>(initialExtra);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedMiles, setOptimizedMiles] = useState<number | null>(initialMiles);
  const toast = useToast();

  // persist the route on every change (debounced) so it survives leaving the page
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const t = setTimeout(() => { saveFieldRoute(selected, optimizedMiles).catch(() => {}); }, 600);
    return () => clearTimeout(t);
  }, [selected, optimizedMiles]);

  const cards = [...extra, ...initial.filter(c => !extra.some(e => e.id === c.id))];
  const cities = [...new Set(initial.map(c => c.city).filter((x): x is string => !!x))]
    .map(city => ({ city, n: initial.filter(c => c.city === city).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const visible = cityFilter ? cards.filter(c => c.city === cityFilter || extra.some(e => e.id === c.id)) : cards;

  const toggle = (id: string) => {
    setOptimizedMiles(null); // selection changed — the old optimization no longer applies
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= 9 ? s : [...s, id]));
  };

  const optimize = () => {
    const stops = selected
      .map(id => cards.find(c => c.id === id))
      .filter((c): c is FieldCard => !!c)
      .map(c => ({ id: c.id, zip: c.zip }));
    const run = (start: { lat: number; lng: number } | null) => {
      optimizeRoute(stops, start)
        .then(r => {
          setSelected(r.orderedIds.filter(id => selected.includes(id)));
          setOptimizedMiles(r.totalMiles);
          toast(r.totalMiles != null ? `Route optimized — about ${r.totalMiles} mi of driving` : "Route reordered");
        })
        .catch(() => toast("Could not optimize — check that stops have ZIP codes", "error"))
        .finally(() => setOptimizing(false));
    };
    setOptimizing(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => run({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => run(null), // no GPS permission → optimize from the first stop
        { enableHighAccuracy: false, timeout: 5000 },
      );
    } else run(null);
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">🧭 Field Mode <span className="text-sm font-normal text-slate-400">({visible.length} to visit)</span></h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Tap ☐ to build today&apos;s route (max 9 stops, in tap order) · 🧭 navigates · 📍 logs the visit with GPS.
          </p>
        </div>
        <NewProspectButton onCreated={c => setExtra(x => [c, ...x])} />
      </div>

      <AddStopSearch existing={cards.map(c => c.id)} onAdd={c => setExtra(x => [c, ...x])} />

      <FieldAsk enabled={aiReady} />

      {cities.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setCityFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cityFilter === null ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
            All ({cards.length})
          </button>
          {cities.map(({ city, n }) => (
            <button key={city} type="button" onClick={() => setCityFilter(cityFilter === city ? null : city)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cityFilter === city ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
              {city} ({n})
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-8 text-center text-sm text-emerald-700">
          Nothing due — every account is covered. 🎉
        </div>
      )}

      {visible.map(c => (
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
            {c.reason.kind !== "new" && <BriefButton customerId={c.id} name={c.name} />}
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

      {selected.length > 0 && routeUrl && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600">
              {routeStops.length} stop{routeStops.length > 1 ? "s" : ""}
              {optimizedMiles != null && <span className="ml-1 font-medium text-emerald-700">· ~{optimizedMiles} mi ✓</span>}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setSelected([]); setOptimizedMiles(null); }}>Clear</Button>
              {selected.length >= 3 && (
                <Button variant="secondary" size="sm" onClick={optimize} disabled={optimizing}>
                  {optimizing ? "Optimizing…" : "⚡ Optimize"}
                </Button>
              )}
              <a href={routeUrl} target="_blank" rel="noopener"
                className="inline-flex h-8 items-center rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
                🗺️ Open route
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
