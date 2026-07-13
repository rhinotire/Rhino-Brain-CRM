"use server";

import { requireSession } from "@/lib/auth";
import { syncPublicProductsToShopify, type ShopifySyncResult } from "@/lib/shopify";

export type ShopifySyncActionResult = { ok: true; result: ShopifySyncResult } | { ok: false; error: string };

/**
 * Admin-triggered one-way sync of PUBLIC products to Shopify.
 * Runs a dry-run preview automatically when Shopify credentials are not configured yet.
 */
export async function runShopifySync(mode: "preview" | "live" = "preview"): Promise<ShopifySyncActionResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Only the owner (Admin) can sync to Shopify." };
  try {
    const result = await syncPublicProductsToShopify({ dryRun: mode === "preview" });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
  }
}
