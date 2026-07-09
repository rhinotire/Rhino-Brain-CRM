"use client";

import { useState, useTransition } from "react";
import { generateFlyerCopy, type FlyerCopy, type FlyerItemInput } from "@/actions/flyers";
import { ProductPicker } from "@/components/product-picker";
import { Button, Input, Select, Field, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type Row = FlyerItemInput & { stockNote?: string };
const emptyRow = (): Row => ({ name: "", description: "", wasPrice: "", specialPrice: "" });

export function FlyerBuilder() {
  const now = new Date();
  const defaultTitle = `${now.toLocaleString("en-US", { month: "long", timeZone: "America/New_York" })} Specials`;
  const [title, setTitle] = useState(defaultTitle);
  const [language, setLanguage] = useState<"en" | "es" | "both">("both");
  const [tone, setTone] = useState("bold and urgent");
  const [contactLine, setContactLine] = useState("Rhino Tire USA — Orlando, FL · Call your sales rep to order");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [copy, setCopy] = useState<FlyerCopy | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(list => list.map((r, x) => (x === i ? { ...r, ...patch } : r)));

  const generate = () => start(async () => {
    const items = rows.filter(r => r.name && r.specialPrice);
    const res = await generateFlyerCopy({ title, language, tone, contactLine, items });
    if (res.ok && res.copy) { setCopy(res.copy); toast("Flyer generated — review below, then print"); }
    else toast(res.error ?? "Failed", "error");
  });

  const validRows = rows.filter(r => r.name && r.specialPrice);

  return (
    <div className="space-y-5">
      <Card title="1️⃣ Set up the special" className="print:hidden">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Flyer title"><Input value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <Field label="Language">
            <Select value={language} onChange={e => setLanguage(e.target.value as "en" | "es" | "both")}>
              <option value="both">English + Español</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </Select>
          </Field>
          <Field label="Tone">
            <Select value={tone} onChange={e => setTone(e.target.value)}>
              <option value="bold and urgent">Bold &amp; urgent</option>
              <option value="friendly and helpful">Friendly</option>
              <option value="professional">Professional</option>
            </Select>
          </Field>
          <Field label="Contact line"><Input value={contactLine} onChange={e => setContactLine(e.target.value)} /></Field>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Products on special</div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-6 items-end gap-2 rounded-md border border-slate-100 bg-slate-50 p-2 sm:grid-cols-12">
              <div className="col-span-6 sm:col-span-3">
                <ProductPicker value={r.name}
                  onType={v => setRow(i, { name: v, stockNote: undefined })}
                  onPick={h => setRow(i, {
                    name: h.sizeSpec ?? h.sku,
                    description: h.description,
                    stockNote: `stock ${h.stock.map(s => `${s.tag}:${s.qty}`).join(" ")}`,
                  })} />
              </div>
              <div className="col-span-6 sm:col-span-4"><Input className="h-8 text-xs" placeholder="Description" value={r.description} onChange={e => setRow(i, { description: e.target.value })} /></div>
              <div className="col-span-2 sm:col-span-2"><Input className="h-8 text-xs" type="number" step="0.01" placeholder="Was $" value={r.wasPrice} onChange={e => setRow(i, { wasPrice: e.target.value })} /></div>
              <div className="col-span-2 sm:col-span-2"><Input className="h-8 text-xs" type="number" step="0.01" placeholder="Special $ *" value={r.specialPrice} onChange={e => setRow(i, { specialPrice: e.target.value })} /></div>
              <button className="col-span-2 h-8 rounded text-xs text-red-500 hover:bg-red-50 sm:col-span-1" onClick={() => setRows(l => l.filter((_, x) => x !== i))} disabled={rows.length === 1}>Remove</button>
              {r.stockNote && <div className="col-span-6 -mt-1 text-xs text-slate-400 sm:col-span-12">📦 {r.stockNote}</div>}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={() => setRows(l => [...l, emptyRow()])}>+ Add product</Button>
            <Button onClick={generate} disabled={pending || validRows.length === 0}>
              {pending ? "🤖 Writing copy…" : "✨ Generate flyer"}
            </Button>
          </div>
        </div>
      </Card>

      {copy && (
        <>
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-sm font-semibold text-slate-600">2️⃣ Preview — click Print and choose &quot;Save as PDF&quot; to get a file you can email or WhatsApp</h2>
            <Button onClick={() => window.print()}>🖨 Print / Save as PDF</Button>
          </div>

          <div id="flyer-print" className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
            <div className="rounded-t-lg bg-ink-900 px-8 py-6 text-center print:rounded-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/rhino-brain-logo.png" alt="Rhino" className="mx-auto h-16 w-16 rounded-lg" />
              <div className="mt-2 text-xl font-black tracking-tight text-white">RHINO <span className="text-brand-500">TIRE USA</span></div>
              <div className="mt-3 text-3xl font-black uppercase text-brand-500">{copy.headline}</div>
              <div className="mt-1 text-sm text-slate-300">{copy.tagline}</div>
            </div>
            <div className="px-8 py-6">
              <div className="mb-1 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{title}</div>
              <p className="mb-5 text-sm text-slate-600">{copy.intro}</p>
              <div className="space-y-3">
                {validRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-4">
                    <div className="min-w-0">
                      <div className="text-lg font-black text-slate-800">{r.name}</div>
                      <div className="text-sm text-slate-500">{r.description}</div>
                      {copy.itemBlurbs[i] && <div className="mt-0.5 text-sm font-medium text-brand-700">{copy.itemBlurbs[i]}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      {r.wasPrice && <div className="text-sm text-slate-400 line-through">${Number(r.wasPrice).toFixed(2)}</div>}
                      <div className="text-2xl font-black text-red-600">${Number(r.specialPrice).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-md bg-amber-50 p-3 text-center text-sm font-semibold text-amber-800">{copy.footer}</div>
              <div className="mt-4 text-center text-xs text-slate-500">{contactLine}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
