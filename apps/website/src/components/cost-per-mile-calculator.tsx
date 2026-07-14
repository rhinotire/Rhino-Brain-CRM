"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Fleet economics: tire cost per mile (price / tread life) with a fleet
 * annualization, plus a quick fuel cost-per-mile block. The point the tool
 * makes for us: the cheaper tire usually isn't the cheaper tire.
 */

const money = (n: number, d = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d, minimumFractionDigits: d });

const num = (t: string) => Number(t.replace(/[,$\s]/g, ""));

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900";
const labelCls = "block text-xs font-bold uppercase tracking-wide text-slate-500";

function TireSide({ label, accent, price, miles, setPrice, setMiles }: {
  label: string; accent: boolean; price: string; miles: string;
  setPrice: (v: string) => void; setMiles: (v: string) => void;
}) {
  return (
    <div className={`rounded-2xl border-2 p-4 ${accent ? "border-brand" : "border-slate-300"}`}>
      <div className={`text-sm font-bold uppercase tracking-wide ${accent ? "text-brand-dark" : "text-slate-500"}`}>{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor={`${label}-price`}>Price per tire ($)</label>
          <input id={`${label}-price`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${label}-miles`}>Expected tread life (miles)</label>
          <input id={`${label}-miles`} inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

export function CostPerMileCalculator() {
  const [priceA, setPriceA] = useState("120");
  const [milesA, setMilesA] = useState("30000");
  const [priceB, setPriceB] = useState("165");
  const [milesB, setMilesB] = useState("55000");
  const [tires, setTires] = useState("18");
  const [milesYear, setMilesYear] = useState("100000");

  const [fuelPrice, setFuelPrice] = useState("3.80");
  const [mpg, setMpg] = useState("6.5");

  const pA = num(priceA), mA = num(milesA), pB = num(priceB), mB = num(milesB);
  const validTires = pA > 0 && pB > 0 && mA >= 1000 && mB >= 1000 && mA < 500000 && mB < 500000;
  const cpmA = validTires ? pA / mA : 0; // $ per mile per tire
  const cpmB = validTires ? pB / mB : 0;
  const cheaper = cpmA <= cpmB ? "A" : "B";
  const savePct = validTires ? (Math.abs(cpmA - cpmB) / Math.max(cpmA, cpmB)) * 100 : 0;

  const nTires = num(tires), nMiles = num(milesYear);
  const fleetOk = validTires && nTires > 0 && nTires <= 1000 && nMiles > 0 && nMiles <= 500000;
  const annualSave = fleetOk ? Math.abs(cpmA - cpmB) * nTires * nMiles : 0;

  const fp = num(fuelPrice), mpgN = num(mpg);
  const fuelOk = fp > 0 && fp < 20 && mpgN > 0 && mpgN < 100;
  const fuelCpm = fuelOk ? fp / mpgN : 0;

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      {/* tire comparison */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TireSide label="Tire A" accent={false} price={priceA} miles={milesA} setPrice={setPriceA} setMiles={setMilesA} />
        <TireSide label="Tire B" accent price={priceB} miles={milesB} setPrice={setPriceB} setMiles={setMilesB} />
      </div>

      {validTires ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Tire A</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{money(cpmA * 1000)}</div>
              <div className="text-xs text-steel-500">per 1,000 miles per tire</div>
            </div>
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Tire B</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{money(cpmB * 1000)}</div>
              <div className="text-xs text-steel-500">per 1,000 miles per tire</div>
            </div>
            <div className="rounded-2xl bg-navy-900 p-5 text-center text-white">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-light">Winner: Tire {cheaper}</div>
              <div className="mt-1 font-display text-3xl font-bold text-brand">{savePct.toFixed(0)}% less</div>
              <div className="text-xs text-steel-300">cost per mile</div>
            </div>
          </div>

          {((cheaper === "B" && pB > pA) || (cheaper === "A" && pA > pB)) && (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
              <span className="font-bold">The pricier tire wins:</span> Tire {cheaper} costs{" "}
              {money(Math.abs(pB - pA), 0)} more up front but runs so much longer that every mile is{" "}
              {savePct.toFixed(0)}% cheaper. Price-per-tire is the wrong number to buy on — cost-per-mile is what hits
              the P&amp;L.
            </p>
          )}

          {/* fleet annualization */}
          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <h2 className="text-base font-bold">Fleet impact</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
              <div>
                <label className={labelCls} htmlFor="cpm-tires">Tires in fleet</label>
                <input id="cpm-tires" inputMode="numeric" value={tires} onChange={(e) => setTires(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cpm-miles">Miles per year (per vehicle)</label>
                <input id="cpm-miles" inputMode="numeric" value={milesYear} onChange={(e) => setMilesYear(e.target.value)} className={inputCls} />
              </div>
            </div>
            {fleetOk && annualSave > 0 && (
              <p className="mt-3 text-sm text-slate-700">
                Running the better tire across <b>{nTires}</b> tire positions at <b>{nMiles.toLocaleString()}</b> miles/year
                saves about <span className="font-display text-xl font-bold text-brand-dark">{money(annualSave, 0)}</span> per year.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          Enter a price and a tread life (1,000–500,000 miles) for both tires.
        </p>
      )}

      {/* fuel cost per mile */}
      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h2 className="text-base font-bold">Fuel cost per mile</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label className={labelCls} htmlFor="cpm-fuel">Fuel price ($/gal)</label>
            <input id="cpm-fuel" inputMode="decimal" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cpm-mpg">Miles per gallon</label>
            <input id="cpm-mpg" inputMode="decimal" value={mpg} onChange={(e) => setMpg(e.target.value)} className={inputCls} />
          </div>
        </div>
        {fuelOk && (
          <p className="mt-3 text-sm text-slate-700">
            Fuel runs <span className="font-display text-xl font-bold text-navy-900">{money(fuelCpm)}</span> per mile —{" "}
            {money(fuelCpm * 1000, 0)} per 1,000 miles. Underinflated or worn-out tires push this number up, which is
            why tire maintenance is fuel money.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Cut your fleet&apos;s cost per mile</h2>
        <p className="mt-2 text-sm text-steel-300">
          Commercial truck tires by position — steer, drive, trailer — at wholesale pricing, with casing-friendly
          national-brand alternatives.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tires/commercial-truck" className="btn-gold">Browse Commercial Tires</Link>
          <Link href="/quote" className="btn-ghost-dark">Request Fleet Pricing</Link>
        </div>
      </div>
    </div>
  );
}
