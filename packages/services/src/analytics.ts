import { db } from "@rhino/database";

/** Allow-listed server-side events (spec §23). No PII in meta — ZIP + ids only. */
const EVENTS = new Set([
  "consumer_path_selected",
  "business_path_selected",
  "installation_search_started",
  "installation_search_completed",
  "ideal_match_found",
  "partner_installer_match_found",
  "installer_match_not_found",
  "installed_price_requested",
  "appointment_requested",
  "send_to_installer_viewed",
  "send_to_installer_started",
  "send_to_installer_completed",
  "existing_dealer_matched",
  "new_installer_prospect_created",
  "installer_contacted",
  "installer_request_opened",
  "installer_accepted",
  "installer_declined",
  "referral_expired",
  "wholesale_quote_requested",
]);

export async function recordEvent(
  event: string,
  data: { brandKey?: string; zip?: string; productId?: string | null; consumerLeadId?: string; meta?: Record<string, string | number | boolean> } = {},
): Promise<void> {
  if (!EVENTS.has(event)) {
    console.warn(`[analytics] unknown event skipped: ${event}`);
    return;
  }
  try {
    await db.analyticsEvent.create({
      data: {
        event,
        brandKey: data.brandKey,
        zip: data.zip,
        productId: data.productId ?? undefined,
        consumerLeadId: data.consumerLeadId,
        meta: data.meta,
      },
    });
  } catch (e) {
    // analytics must never break a user flow
    console.error("[analytics] write failed:", e instanceof Error ? e.message : e);
  }
}
