import { randomBytes } from "crypto";
import { db } from "@rhino/database";
import { z } from "zod";
import { rateLimited } from "./public-lead-service";
import { isValidUsZip } from "./geo";
import { sendEmail } from "./email";
import { recordEvent } from "./analytics";

const CONSENT_TEXT =
  "I agree to be contacted about this request by phone, text, or email by the store and its supplier.";

const baseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  zip: z.string().trim().regex(/^\d{5}$/),
  productId: z.string().trim().max(40).optional().or(z.literal("")),
  tireSize: z.string().trim().max(40).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(100).default(4),
  preferredDate: z.string().trim().max(30).optional().or(z.literal("")),
  preferredContact: z.enum(["phone", "text", "email"]).default("phone"),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  vehicle: z.string().trim().max(120).optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent required" }) }),
});

export type ConsumerRequestInput = z.infer<typeof baseSchema>;
export type ConsumerLeadResult = { ok: true; consumerToken: string } | { ok: false; error: string };

const newToken = () => randomBytes(32).toString("base64url");

async function logStatus(consumerLeadId: string, from: string | null, to: string, actor: string, reason?: string) {
  await db.referralStatusHistory.create({ data: { consumerLeadId, fromStatus: from, toStatus: to, actor, reason } });
}

/** In-app notify + task for the brand's managers (front desk works from these + email). */
async function notifyCrm(params: { locationId: string; title: string; body: string; leadId: string; assignedRepId?: string | null }) {
  const managers = await db.user.findMany({
    where: { active: true, role: { in: ["MANAGER", "ADMIN"] }, OR: [{ locationId: params.locationId }, { locationId: null }] },
    select: { id: true },
  });
  const link = `/consumer-leads?focus=${params.leadId}`;
  await db.notification.createMany({
    data: managers.map((m) => ({ userId: m.id, type: "LEAD_ASSIGNED" as const, title: params.title, body: params.body, link })),
  });
  const assignee = params.assignedRepId ?? managers[0]?.id;
  if (assignee) {
    const creator = managers[0]?.id ?? assignee;
    await db.task.create({
      data: {
        title: params.title,
        description: `${params.body}\nOpen: ${link}`,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        priority: "HIGH",
        type: "FOLLOW_UP",
        assigneeId: assignee,
        creatorId: creator,
        locationId: params.locationId,
      },
    });
  }
}

/**
 * Public consumer-lead writes (MVP-A kinds). Validated, rate-limited, consent
 * recorded, status history started, CRM + installer notified. Never returns
 * internal data — only the consumer's own tracking token.
 */
export const PublicConsumerLeadService = {
  async create(
    kind: "INSTALLED_PRICE" | "APPOINTMENT" | "INSTALLER_NEEDED",
    input: unknown,
    ctx: { rateKey: string; ip: string; brandKey: string; sourceUrl?: string; installerId?: string },
  ): Promise<ConsumerLeadResult> {
    if (rateLimited(`consumer:${ctx.rateKey}`)) return { ok: false, error: "Too many requests. Please call us instead." };
    const parsed = baseSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Please check the highlighted fields." };
    const d = parsed.data;
    if (!isValidUsZip(d.zip)) return { ok: false, error: "Please enter a valid US ZIP code." };

    const brand = await db.brandConfig.findUnique({ where: { key: ctx.brandKey } });
    if (!brand?.active) return { ok: false, error: "This service is not available yet." };

    // installer must belong to the brand's company — never trust a raw id from the client
    let installer = null;
    if (ctx.installerId) {
      installer = await db.installer.findFirst({
        where: { id: ctx.installerId, locationId: brand.locationId, active: true },
        select: { id: true, storeName: true, notifyEmail: true, assignedRepId: true },
      });
    }

    const product = d.productId
      ? await db.product.findUnique({ where: { id: d.productId }, select: { id: true, sku: true, name: true, description: true, sizeSpec: true } })
      : null;

    const lead = await db.consumerLead.create({
      data: {
        brandKey: ctx.brandKey,
        sourceUrl: ctx.sourceUrl?.slice(0, 300),
        name: d.name,
        phone: d.phone,
        email: d.email || null,
        zip: d.zip,
        vehicleJson: d.vehicle ? { raw: d.vehicle } : undefined,
        preferredContact: d.preferredContact,
        preferredDate: d.preferredDate ? new Date(d.preferredDate) : null,
        message: d.message || null,
        productId: product?.id ?? null,
        tireSize: d.tireSize || product?.sizeSpec || null,
        quantity: d.quantity,
        kind,
        status: kind === "INSTALLER_NEEDED" ? "INSTALLER_NEEDED" : "SUBMITTED",
        installerId: installer?.id ?? null,
        locationId: brand.locationId,
        assignedRepId: installer?.assignedRepId ?? null,
        consumerToken: newToken(),
        consents: { create: { kind: "CONTACT", textShown: CONSENT_TEXT, ip: ctx.ip } },
      },
    });
    await logStatus(lead.id, null, lead.status, "consumer");

    const productLine = product ? `${product.name ?? product.description} (SKU ${product.sku})` : d.tireSize || "tires";
    const kindLabel = kind === "INSTALLED_PRICE" ? "Installed price request" : kind === "APPOINTMENT" ? "Appointment request" : "Installer needed";
    const summary = `${kindLabel}: ${d.quantity}x ${productLine} — ${d.name}, ZIP ${d.zip}, ${d.phone}`;

    await notifyCrm({
      locationId: brand.locationId,
      title: `${kindLabel} — ${installer?.storeName ?? "no installer"}`,
      body: summary,
      leadId: lead.id,
      assignedRepId: installer?.assignedRepId,
    });
    if (installer?.notifyEmail) {
      await sendEmail(
        installer.notifyEmail,
        `[${brand.name}] ${kindLabel} — ${d.quantity}x ${productLine}`,
        `${summary}\n\nPreferred date: ${d.preferredDate || "any"}\nPreferred contact: ${d.preferredContact}\nNotes: ${d.message || "-"}\n\nReply to the customer directly or manage it in RHINO BRAIN.`,
      );
    }
    await recordEvent(
      kind === "INSTALLED_PRICE" ? "installed_price_requested" : kind === "APPOINTMENT" ? "appointment_requested" : "installer_match_not_found",
      { brandKey: ctx.brandKey, zip: d.zip, productId: product?.id, consumerLeadId: lead.id },
    );

    return { ok: true, consumerToken: lead.consumerToken };
  },

  /** Consumer status page data — masked, capability = the token itself. */
  async getStatus(consumerToken: string) {
    if (!consumerToken || consumerToken.length < 20) return null;
    const lead = await db.consumerLead.findUnique({
      where: { consumerToken },
      select: {
        kind: true, status: true, quantity: true, tireSize: true, zip: true, createdAt: true,
        product: { select: { name: true, description: true, sizeSpec: true } },
        installer: { select: { storeName: true, city: true, state: true, phone: true } },
        statusHistory: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } },
      },
    });
    if (!lead) return null;
    return {
      kind: lead.kind,
      status: lead.status,
      product: lead.product?.name ?? lead.product?.description ?? lead.tireSize ?? "Tires",
      quantity: lead.quantity,
      storeName: lead.installer?.storeName ?? null,
      storeCity: lead.installer ? `${lead.installer.city}, ${lead.installer.state}` : null,
      storePhone: lead.installer?.phone ?? null,
      timeline: lead.statusHistory.map((h) => ({ status: h.toStatus, at: h.createdAt })),
      createdAt: lead.createdAt,
    };
  },
};
