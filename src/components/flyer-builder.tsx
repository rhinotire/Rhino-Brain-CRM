"use client";

import { useEffect, useState, useTransition } from "react";
import { generateFlyerCopy, suggestFlyerProducts, type FlyerCopy, type FlyerItemInput } from "@/actions/flyers";
import { ProductPicker } from "@/components/product-picker";
import { Button, Input, Select, Textarea, Field, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const THEME_PRESETS: [string, string][] = [
  ["🇺🇸 July 4th", "Independence Day sale — patriotic energy, summer road trips, get fleets and shops stocked for the holiday rush"],
  ["🌀 Hurricane season", "Florida hurricane season prep — trailer tires and spares in stock now, don't get caught unprepared when a storm is coming"],
  ["🔥 Overstock blowout", "Warehouse overstock clearance — prices this low only while these quantities last, first come first served"],
  ["📦 New arrivals", "Just landed — new container arrived, fresh stock of hard-to-find sizes, order before they sell out again"],
  ["🎄 Year-end", "Year-end closeout — last chance at this year's pricing, stock up before the new year price increases"],
  ["🚚 Fleet special", "Fleet-focused deal — volume pricing for fleets and repair shops, keep your trucks rolling for less"],
];

type Row = FlyerItemInput & { stockNote?: string; image?: string; reason?: string };
const emptyRow = (): Row => ({ name: "", description: "", wasPrice: "", specialPrice: "" });

const LOGO_KEY = "rhino_flyer_logo";

function readAsDataUrl(file: File, cb: (url: string) => void) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result));
  r.readAsDataURL(file);
}

export function FlyerBuilder({ categories }: { categories?: string[] }) {
  const now = new Date();
  const defaultTitle = `${now.toLocaleString("en-US", { month: "long", timeZone: "America/New_York" })} Specials`;
  const [title, setTitle] = useState(defaultTitle);
  const [language, setLanguage] = useState<"en" | "es" | "both">("both");
  const [tone, setTone] = useState("bold and urgent");
  const [contactLine, setContactLine] = useState("Rhino Tire USA — Orlando, FL · Call your sales rep to order");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [copy, setCopy] = useState<FlyerCopy | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  // company logo is remembered on this computer once uploaded
  useEffect(() => {
    try { const saved = localStorage.getItem(LOGO_KEY); if (saved) setLogo(saved); } catch {}
  }, []);
  const saveLogo = (file: File) => readAsDataUrl(file, url => {
    setLogo(url);
    try { localStorage.setItem(LOGO_KEY, url); toast("Logo saved — it will be used on every flyer"); }
    catch { toast("Logo loaded for this flyer (too large to remember — use an image under ~2 MB to save it)", "error"); }
  });

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(list => list.map((r, x) => (x === i ? { ...r, ...patch } : r)));

  const generate = () => start(async () => {
    const items = rows.filter(r => r.name && r.specialPrice);
    const res = await generateFlyerCopy({ title, language, tone, contactLine, notes, items });
    if (res.ok && res.copy) { setCopy(res.copy); toast("Flyer generated — review below, then print"); }
    else toast(res.error ?? "Failed", "error");
  });

  const autoPick = () => start(async () => {
    const res = await suggestFlyerProducts();
    if (res.ok && res.items) {
      setRows(res.items.map(s => ({
        name: s.name, description: s.description, wasPrice: "", specialPrice: "",
        stockNote: s.stockNote, reason: s.reason,
      })));
      setCopy(null);
      toast(`AI picked ${res.items.length} products — now set your special prices`);
    } else toast(res.error ?? "Failed", "error");
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

        <div className="mt-3">
          <Field label="Promotion theme / notes to the AI (optional)">
            <>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[60px]"
                placeholder='e.g. "4th of July sale, focus on trailer tires, mention free local delivery on 20+ tires" — 中文写也可以，文案仍按所选语言输出' />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {THEME_PRESETS.map(([label, text]) => (
                  <button key={label} type="button"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50"
                    onClick={() => setNotes(text)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-slate-300 p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company logo</span>
          {logo
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={logo} alt="logo" className="h-10 w-auto rounded border border-slate-200 bg-white px-1" />
            : <span className="text-xs text-slate-400">none yet — using the default Rhino header</span>}
          <label className="cursor-pointer rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300">
            {logo ? "Change logo" : "⬆ Upload logo"}
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) saveLogo(f); e.target.value = ""; }} />
          </label>
          {logo && (
            <button type="button" className="text-xs text-red-500 hover:underline"
              onClick={() => { setLogo(null); try { localStorage.removeItem(LOGO_KEY); } catch {} }}>
              Remove
            </button>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Products on special</div>
            <Button variant="secondary" size="sm" onClick={autoPick} disabled={pending}>
              {pending ? "🤖 Analyzing…" : "🤖 AI pick this month's products"}
            </Button>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-6 items-end gap-2 rounded-md border border-slate-100 bg-slate-50 p-2 sm:grid-cols-12">
              <div className="col-span-6 sm:col-span-3">
                <ProductPicker value={r.name} categories={categories}
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
              <div className="col-span-6 -mt-1 flex flex-wrap items-center gap-3 sm:col-span-12">
                {r.reason && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">💡 {r.reason}</span>}
                {r.stockNote && <span className="text-xs text-slate-400">📦 {r.stockNote}</span>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.image && <img src={r.image} alt="" className="h-8 w-8 rounded border border-slate-200 object-cover" />}
                <label className="cursor-pointer text-xs text-brand-600 hover:underline">
                  {r.image ? "Change photo" : "📷 Add tire photo"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) readAsDataUrl(f, url => setRow(i, { image: url })); e.target.value = ""; }} />
                </label>
                {r.image && <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => setRow(i, { image: undefined })}>remove photo</button>}
              </div>
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
            {logo && (
              <div className="rounded-t-lg bg-white px-8 pb-3 pt-6 text-center print:rounded-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="Company logo" className="mx-auto max-h-28 w-auto max-w-full" />
              </div>
            )}
            <div className={`${logo ? "" : "rounded-t-lg"} bg-ink-900 px-8 py-6 text-center print:rounded-none`}>
              {!logo && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/rhino-brain-logo.png" alt="Rhino" className="mx-auto h-16 w-16 rounded-lg" />
                  <div className="mt-2 text-xl font-black tracking-tight text-white">RHINO <span className="text-brand-500">TIRE USA</span></div>
                </>
              )}
              <div className={`${logo ? "" : "mt-3"} text-3xl font-black uppercase text-brand-500`}>{copy.headline}</div>
              <div className="mt-1 text-sm text-slate-300">{copy.tagline}</div>
            </div>
            <div className="px-8 py-6">
              <div className="mb-1 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{title}</div>
              <p className="mb-5 text-sm text-slate-600">{copy.intro}</p>
              <div className="space-y-3">
                {validRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-4">
                    <div className="flex min-w-0 items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.image && <img src={r.image} alt={r.name} className="h-20 w-20 shrink-0 rounded-md border border-slate-100 object-cover" />}
                      <div className="min-w-0">
                        <div className="text-lg font-black text-slate-800">{r.name}</div>
                        <div className="text-sm text-slate-500">{r.description}</div>
                        {copy.itemBlurbs[i] && <div className="mt-0.5 text-sm font-medium text-brand-700">{copy.itemBlurbs[i]}</div>}
                      </div>
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
