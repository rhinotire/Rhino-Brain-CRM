"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { recordCertVerification } from "@/actions/cert-verify";
import { Modal } from "@/components/ui/modal";
import { Button, Badge, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export type CertRow = {
  id: string; fileName: string; expiresAt: string | null;
  verifyStatus: string | null; verifiedAt: string | null; verifiedBy: string | null; verifyNotes: string | null;
};

/** Official lookup links per state — opened by the person verifying. */
const LINKS: Record<string, [string, string][]> = {
  FL: [
    ["FL DOR — Verify Resale Certificate", "https://verify.floridarevenue.com/"],
    ["Sunbiz — Business Entity Search", "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName"],
  ],
  TX: [
    ["TX Comptroller — Sales Taxpayer Search", "https://mycpa.cpa.state.tx.us/staxpayerSearch/"],
  ],
};

function daysOld(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
}

export function CertVerifyPanel({ certs, customerState, companyName, taxId }: {
  certs: CertRow[]; customerState: string | null; companyName: string; taxId: string | null;
}) {
  const [target, setTarget] = useState<CertRow | null>(null);
  const [state, action] = useFormState(recordCertVerification, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast("Verification recorded"); setTarget(null); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (certs.length === 0) return null;
  const links = LINKS[(customerState ?? "").toUpperCase()] ?? [...LINKS.FL, ...LINKS.TX];

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied ✓`); } catch { /* noop */ }
  };

  const statusBadge = (c: CertRow) => {
    const age = daysOld(c.verifiedAt);
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    if (expired) return <Badge className="bg-red-600 text-white">CERT EXPIRED</Badge>;
    if (c.verifyStatus === "FAILED") return <Badge className="bg-red-600 text-white">FAILED VERIFICATION</Badge>;
    if (c.verifyStatus === "VERIFIED" && age !== null && age > 365) return <Badge className="bg-amber-100 text-amber-800">RECHECK DUE</Badge>;
    if (c.verifyStatus === "VERIFIED") return <Badge className="bg-emerald-100 text-emerald-700">VERIFIED ✓</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">NOT VERIFIED</Badge>;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Resale Certificate Verification</h2>
      <p className="mb-3 text-xs text-slate-500">
        Check the certificate against the official state registry, then record the result here — the trail (who, when, evidence) is kept and a recheck is reminded yearly.
      </p>
      <div className="space-y-2">
        {certs.map(c => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700">{c.fileName}</span>
            {statusBadge(c)}
            {c.verifiedAt && (
              <span className="text-xs text-slate-400">
                {c.verifyStatus === "VERIFIED" ? "verified" : "checked"} {new Date(c.verifiedAt).toLocaleDateString("en-US")} {c.verifiedBy ? `by ${c.verifiedBy}` : ""}
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={() => setTarget(c)}>Verify</Button>
          </div>
        ))}
      </div>

      <Modal open={!!target} onClose={() => setTarget(null)} title="Verify against the official registry">
        {target && (
          <div className="space-y-3">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
              <div className="mb-1.5 font-semibold text-sky-900">1. Look it up (opens in a new tab):</div>
              <div className="space-y-1">
                {links.map(([label, url]) => (
                  <a key={url} href={url} target="_blank" rel="noopener" className="block text-sky-700 underline">↗ {label}</a>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button type="button" className="rounded border border-sky-300 bg-white px-2 py-0.5 text-sky-700" onClick={() => copy(companyName, "Company name")}>📋 copy company name</button>
                {taxId && <button type="button" className="rounded border border-sky-300 bg-white px-2 py-0.5 text-sky-700" onClick={() => copy(taxId, "Tax ID")}>📋 copy tax ID</button>}
              </div>
            </div>
            <form action={action} className="space-y-3">
              <input type="hidden" name="documentId" value={target.id} />
              <div className="text-sm font-semibold text-slate-700">2. Record the result:</div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5"><input type="radio" name="status" value="VERIFIED" required /> ✅ Verified — active & matches</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="status" value="FAILED" /> ❌ Failed — invalid / no match</label>
              </div>
              <Field label="Screenshot of the lookup result (evidence, optional)">
                <input name="evidence" type="file" accept="image/*"
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" rows={2} placeholder="Certificate #, registry status, anything unusual…" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
                <SubmitButton>Save verification</SubmitButton>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
