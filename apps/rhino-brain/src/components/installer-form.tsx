"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createInstaller, updateInstaller, searchInstallerCandidates, type CustomerCandidate } from "@/actions/installers";
import type { ActionResult } from "@/actions/auth";
import { Button, Input, Select, Field, Card } from "@/components/ui/primitives";
import type { InstallerFormValues } from "@/lib/installer-form-values";

const CAPS: { key: keyof InstallerFormValues & string; label: string }[] = [
  { key: "passenger", label: "Passenger tires" },
  { key: "lightTruck", label: "Light truck / LT" },
  { key: "trailer", label: "Trailer (ST)" },
  { key: "tbr", label: "Commercial truck (TBR)" },
  { key: "wheels", label: "Wheels / mounting" },
  { key: "mobileService", label: "Mobile service" },
];

function SubmitButton({ edit }: { edit: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : edit ? "Save Changes" : "Add Installer"}</Button>;
}

/** Search existing dealer customers and prefill the form — llanteras are installers. */
function CustomerPicker({ onPick }: { onPick: (c: CustomerCandidate) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  // recent customers appear immediately — no typing needed to start picking
  useEffect(() => {
    let alive = true;
    searchInstallerCandidates("").then((r) => { if (alive) setResults(r); });
    return () => { alive = false; };
  }, []);

  async function run(value: string) {
    setQ(value);
    setSearching(true);
    try {
      setResults(await searchInstallerCandidates(value));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card title="Convert an existing dealer customer" className="mb-4">
      <p className="mb-2 text-xs text-slate-500">
        Pick a recent customer below, or search by name, city or phone — the form fills itself and stays linked to the customer record.
      </p>
      <Input value={q} onChange={(e) => run(e.target.value)} placeholder="e.g. llantera, Orlando, 407…" />
      {searching && <div className="mt-2 text-xs text-slate-400">Searching…</div>}
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => { onPick(c); setResults([]); setQ(c.companyName); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{c.companyName}</span>
                <span className="text-xs text-slate-400">{[c.city, c.state].filter(Boolean).join(", ")} {c.phone ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function InstallerForm({
  initial,
  locations,
  currentLocationId,
  showLocationSelect,
}: {
  initial: InstallerFormValues;
  locations: { id: string; name: string }[];
  currentLocationId: string | null;
  showLocationSelect: boolean;
}) {
  const edit = !!initial.id;
  const [v, setV] = useState(initial);
  const action = edit ? updateInstaller.bind(null, initial.id!) : createInstaller;
  const [state, formAction] = useFormState<ActionResult | null, FormData>(action, null);

  const set = (patch: Partial<InstallerFormValues>) => setV((p) => ({ ...p, ...patch }));

  return (
    <div className="max-w-2xl">
      {!edit && (
        <CustomerPicker
          onPick={(c) =>
            set({
              customerId: c.id,
              storeName: c.companyName,
              phone: c.phone ?? "",
              email: c.email ?? "",
              address: c.address ?? "",
              city: c.city ?? "",
              state: c.state ?? "",
              zip: c.zip && /^\d{5}/.test(c.zip) ? c.zip.slice(0, 5) : "",
            })
          }
        />
      )}

      <form action={formAction} className="space-y-4">
        {v.customerId && <input type="hidden" name="customerId" value={v.customerId} />}
        <Card title={edit ? `Edit — ${initial.storeName}` : "Installer details"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Store name *" className="sm:col-span-2">
              <Input name="storeName" required value={v.storeName} onChange={(e) => set({ storeName: e.target.value })} />
            </Field>
            <Field label="Legal name">
              <Input name="legalName" value={v.legalName} onChange={(e) => set({ legalName: e.target.value })} />
            </Field>
            <Field label="Phone *">
              <Input name="phone" type="tel" required value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Lead notification email">
              <Input name="notifyEmail" type="email" placeholder="front desk inbox" value={v.notifyEmail} onChange={(e) => set({ notifyEmail: e.target.value })} />
            </Field>
            <Field label="Website" className="sm:col-span-2">
              <Input name="website" value={v.website} onChange={(e) => set({ website: e.target.value })} />
            </Field>
            <Field label="Street address *" className="sm:col-span-2">
              <Input name="address" required value={v.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <Field label="City *">
              <Input name="city" required value={v.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State *">
                <Input name="state" required maxLength={20} placeholder="FL" value={v.state} onChange={(e) => set({ state: e.target.value })} />
              </Field>
              <Field label="ZIP *">
                <Input name="zip" required pattern="\d{5}" inputMode="numeric" value={v.zip} onChange={(e) => set({ zip: e.target.value })} />
              </Field>
            </div>
            <Field label="Service radius (miles)">
              <Input name="serviceRadiusMi" type="number" min={5} max={200} value={v.serviceRadiusMi} onChange={(e) => set({ serviceRadiusMi: Number(e.target.value) })} />
            </Field>
            <Field label="Network status">
              <Select name="preferredStatus" value={v.preferredStatus} onChange={(e) => set({ preferredStatus: e.target.value })}>
                <option value="PREFERRED">Preferred — shown first</option>
                <option value="PARTNER">Partner</option>
                <option value="PROSPECT">Prospect — not yet approved</option>
                <option value="OWNED">Owned store (priority 1 — one per company)</option>
              </Select>
            </Field>
            {showLocationSelect && !edit && (
              <Field label="Company / location *">
                <Select name="locationId" defaultValue={currentLocationId ?? ""} required>
                  <option value="" disabled>Select…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </Card>

        <Card title="Services offered">
          <div className="grid gap-2 sm:grid-cols-2">
            {CAPS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name={`cap_${key}`} checked={Boolean(v[key])}
                  onChange={(e) => set({ [key]: e.target.checked } as Partial<InstallerFormValues>)} />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="appointmentEnabled" checked={v.appointmentEnabled}
                onChange={(e) => set({ appointmentEnabled: e.target.checked })} />
              Accepts appointments
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="sameDayEnabled" checked={v.sameDayEnabled}
                onChange={(e) => set({ sameDayEnabled: e.target.checked })} />
              Same-day service (verified)
            </label>
          </div>
        </Card>

        {state && !state.ok && state.error && (
          <p className="text-sm font-semibold text-red-600">{state.error}</p>
        )}
        <SubmitButton edit={edit} />
      </form>
    </div>
  );
}
