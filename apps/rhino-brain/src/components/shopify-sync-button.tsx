"use client";

import { useState, useTransition } from "react";
import { runShopifySync, type ShopifySyncActionResult } from "@/actions/shopify";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function ShopifySyncButton() {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<ShopifySyncActionResult | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const run = (mode: "preview" | "live") =>
    start(async () => {
      const r = await runShopifySync(mode);
      setRes(r);
      if (!r.ok) toast(r.error, "error");
      else if (mode === "live") toast(`Synced ${r.result.synced.length} products to Shopify`, "success");
    });

  const result = res?.ok ? res.result : null;

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => { setOpen(true); if (!res) run("preview"); }}>
        🛍️ Sync to Shopify
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Shopify Product Sync" wide>
        <div className="space-y-3 text-sm">
          {pending && <p className="text-slate-500">Checking products…</p>}

          {result && (
            <>
              <div className={`rounded-md px-3 py-2 ${result.configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {result.configured
                  ? <>Connected to <b>{result.storeDomain}</b>.{result.dryRun ? " Showing a preview — nothing was pushed yet." : " Live sync complete."}</>
                  : <>⚙️ Shopify is <b>not connected yet</b>. This is a preview of what <i>would</i> sync once credentials are added (SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_API_TOKEN).</>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Stat label="PUBLIC products" value={result.totalPublishable} />
                <Stat label="Ready to sync" value={result.wouldSync} tone="good" />
                <Stat label="Skipped" value={result.skipped.length} tone={result.skipped.length ? "warn" : undefined} />
              </div>

              {result.synced.length > 0 && (
                <p className="text-emerald-700">✅ Synced {result.synced.length}: {result.synced.slice(0, 8).map(s => s.sku).join(", ")}{result.synced.length > 8 ? "…" : ""}</p>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                  <b>{result.errors.length} errors:</b>
                  <ul className="mt-1 list-disc pl-4">{result.errors.slice(0, 6).map(e => <li key={e.sku}>{e.sku}: {e.message}</li>)}</ul>
                </div>
              )}
              {result.skipped.length > 0 && (
                <details className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  <summary className="cursor-pointer font-medium">{result.skipped.length} products skipped — click to see why</summary>
                  <ul className="mt-1 list-disc pl-4">{result.skipped.slice(0, 12).map(s => <li key={s.sku}>{s.sku}: {s.reason}</li>)}</ul>
                  {result.skipped.length > 12 && <p className="mt-1 text-xs">…and {result.skipped.length - 12} more.</p>}
                </details>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run("preview")}>Refresh preview</Button>
                {result.configured && (
                  <Button variant="primary" size="sm" disabled={pending || result.wouldSync === 0}
                    onClick={() => run("live")}>
                    Push {result.wouldSync} to Shopify now
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-800";
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2 text-center">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
