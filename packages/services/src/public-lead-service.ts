import { db } from "@rhino/database";
import { z } from "zod";
import { notifyCrm } from "./crm-notify";
import { sendEmail } from "./email";
import { signDealerDocUrl } from "./storage";

/**
 * Fixed-window in-memory rate limiter. Per serverless instance only — good
 * enough to blunt casual abuse in Phase 1; STEP 5 tracks a durable limiter.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; windowStart: number }>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.windowStart > WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }
  h.count += 1;
  if (hits.size > 10_000) hits.clear(); // bound memory
  return h.count > MAX_PER_WINDOW;
}

const quoteSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(40).optional().or(z.literal("")),
  productsOfInterest: z.string().trim().min(2).max(500),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type QuoteRequestInput = z.infer<typeof quoteSchema>;

const dealerSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(120),
  businessType: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  monthlyVolume: z.string().trim().max(80).optional().or(z.literal("")),
  locationsCount: z.string().trim().max(20).optional().or(z.literal("")),
  deliveryZip: z.string().trim().max(15).optional().or(z.literal("")),
  productsOfInterest: z.string().trim().max(500).optional().or(z.literal("")),
});
export type DealerApplicationInput = z.infer<typeof dealerSchema>;

export type PublicLeadResult = { ok: true } | { ok: false; error: string };

/** Round-robin-ish: the active rep with the fewest open leads at the primary location. */
async function pickRep(): Promise<{ repId: string | null; locationId: string | null }> {
  const location = await db.location.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const reps = await db.user.findMany({
    where: { active: true, role: { in: ["SALES_REP", "MANAGER"] }, ...(location ? { locationId: location.id } : {}) },
    select: { id: true, role: true, _count: { select: { leads: { where: { stage: "NEW_LEAD" } } } } },
  });
  reps.sort((a, b) => (a.role === b.role ? a._count.leads - b._count.leads : a.role === "SALES_REP" ? -1 : 1));
  return { repId: reps[0]?.id ?? null, locationId: location?.id ?? null };
}

/**
 * The ONLY write surface exposed to the anonymous website tier
 * (docs/architecture.md): quote requests and dealer applications, both
 * validated, rate-limited by the caller-supplied key (IP), stored as Leads.
 */
export const PublicLeadService = {
  async createQuoteRequest(input: unknown, rateKey: string): Promise<PublicLeadResult> {
    if (rateLimited(`quote:${rateKey}`)) return { ok: false, error: "Too many requests. Please call us instead." };
    const parsed = quoteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Please check the highlighted fields." };
    const d = parsed.data;
    const { repId, locationId } = await pickRep();
    await db.lead.create({
      data: {
        companyName: d.companyName,
        contactPerson: d.contactPerson,
        phone: d.phone,
        email: d.email || null,
        city: d.city || null,
        state: d.state || null,
        source: "WEBSITE_QUOTE",
        notes: `Products: ${d.productsOfInterest}${d.message ? `\n\n${d.message}` : ""}`,
        meta: { productsOfInterest: d.productsOfInterest, message: d.message || null },
        assignedRepId: repId,
        locationId,
      },
    });
    return { ok: true };
  },

  async createDealerApplication(
    input: unknown,
    rateKey: string,
    extras?: { resaleCertPath?: string | null },
  ): Promise<PublicLeadResult> {
    if (rateLimited(`dealer:${rateKey}`)) return { ok: false, error: "Too many requests. Please call us instead." };
    const parsed = dealerSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Please check the highlighted fields." };
    const d = parsed.data;
    const { repId, locationId } = await pickRep();
    const certPath = extras?.resaleCertPath || null;
    const lead = await db.lead.create({
      data: {
        companyName: d.companyName,
        contactPerson: d.contactPerson,
        phone: d.phone,
        email: d.email,
        city: d.city,
        state: d.state,
        source: "WEBSITE_DEALER_APP",
        notes: `Dealer application — ${d.businessType}${d.monthlyVolume ? `, ~${d.monthlyVolume}/mo` : ""}\nAddress: ${d.address}, ${d.city}, ${d.state}${certPath ? "\nResale certificate uploaded ✓" : ""}`,
        meta: {
          businessType: d.businessType,
          address: d.address,
          monthlyVolume: d.monthlyVolume || null,
          locationsCount: d.locationsCount || null,
          deliveryZip: d.deliveryZip || null,
          productsOfInterest: d.productsOfInterest || null,
          resaleCertPath: certPath,
        },
        assignedRepId: repId,
        locationId,
      },
    });

    // Sales visibility: in-app notification + task (+ email with a 7-day cert link)
    if (locationId) {
      const certUrl = certPath ? await signDealerDocUrl(certPath) : null;
      const summary = `${d.companyName} (${d.businessType}) — ${d.contactPerson}, ${d.phone}\n${d.address}, ${d.city}, ${d.state}${d.monthlyVolume ? `\nVolume: ~${d.monthlyVolume}/mo` : ""}${certUrl ? `\nResale certificate (link valid 7 days): ${certUrl}` : "\nNo resale certificate uploaded yet."}`;
      await notifyCrm({
        locationId,
        title: `New dealer application: ${d.companyName}`,
        body: summary,
        link: `/leads`,
        assignedRepId: repId,
      });
      const salesInbox = process.env.ZOHO_SMTP_USER;
      if (salesInbox) {
        await sendEmail(salesInbox, `[Dealer Application] ${d.companyName} — ${d.city}, ${d.state}`, `${summary}\n\nLead created in RHINO BRAIN and assigned.`);
      }
    }
    void lead;
    return { ok: true };
  },
};
