import { randomBytes } from "crypto";
import { db } from "@rhino/database";
import { z } from "zod";
import { rateLimited } from "./public-lead-service";
import { isValidUsZip } from "./geo";
import { sendEmail } from "./email";
import { recordEvent } from "./analytics";
import { notifyCrm } from "./crm-notify";
import { matchInstallerReferral } from "./referral-matching";

const EXPIRY_DAYS = 14; // owner decision, 2026-07-11

const CONSENT_TEXT =
  "I agree that my request and contact information may be shared with the selected tire shop, and that the shop or its supplier may contact me about this request.";

const schema = z.object({
  // consumer
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  zip: z.string().trim().regex(/^\d{5}$/),
  quantity: z.coerce.number().int().min(1).max(100).default(4),
  preferredDate: z.string().trim().max(30).optional().or(z.literal("")),
  vehicle: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  // product
  productId: z.string().trim().max(40).optional().or(z.literal("")),
  tireSize: z.string().trim().max(40).optional().or(z.literal("")),
  // installer (raw, as the consumer knows it)
  installerName: z.string().trim().min(2).max(120),
  installerPhone: z.string().trim().max(30).optional().or(z.literal("")),
  installerAddress: z.string().trim().max(200).optional().or(z.literal("")),
  installerZip: z.string().trim().regex(/^\d{5}$/),
  installerWebsite: z.string().trim().max(200).optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent required" }) }),
});

const newToken = () => randomBytes(32).toString("base64url");
const maskName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

async function logStatus(consumerLeadId: string, from: string | null, to: string, actor: string, reason?: string) {
  await db.referralStatusHistory.create({ data: { consumerLeadId, fromStatus: from, toStatus: to, actor, reason } });
}

async function leastLoadedRep(locationId: string): Promise<string | null> {
  const reps = await db.user.findMany({
    where: { active: true, role: { in: ["SALES_REP", "MANAGER"] }, locationId },
    select: { id: true, role: true, _count: { select: { leads: { where: { stage: "NEW_LEAD" } } } } },
  });
  reps.sort((a, b) => (a.role === b.role ? a._count.leads - b._count.leads : a.role === "SALES_REP" ? -1 : 1));
  return reps[0]?.id ?? null;
}

export type SendToInstallerResult = { ok: true; consumerToken: string } | { ok: false; error: string };

export const PublicReferralService = {
  /** Spec §11 — the dealer-recruitment engine. */
  async createSendToInstaller(
    input: unknown,
    ctx: { rateKey: string; ip: string; brandKey: string; sourceUrl?: string; siteUrl: string },
  ): Promise<SendToInstallerResult> {
    if (rateLimited(`sti:${ctx.rateKey}`)) return { ok: false, error: "Too many requests. Please call us instead." };
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Please check the highlighted fields." };
    const d = parsed.data;
    if (!isValidUsZip(d.zip)) return { ok: false, error: "Please enter a valid US ZIP code." };

    const brand = await db.brandConfig.findUnique({ where: { key: ctx.brandKey } });
    if (!brand?.active) return { ok: false, error: "This service is not available yet." };

    const product = d.productId
      ? await db.product.findUnique({ where: { id: d.productId }, select: { id: true, sku: true, name: true, description: true, sizeSpec: true } })
      : null;
    const productLine = product ? `${product.name ?? product.description} (SKU ${product.sku})` : d.tireSize || "tires";

    const match = await matchInstallerReferral({
      rawName: d.installerName,
      rawPhone: d.installerPhone,
      rawWebsite: d.installerWebsite,
      rawZip: d.installerZip,
    });

    const locationId = match.locationId ?? brand.locationId;
    const assignedRepId = match.assignedRepId ?? (await leastLoadedRep(brand.locationId));

    const leadStatus =
      match.matchStatus === "EXISTING_DEALER" ? ("EXISTING_DEALER_MATCHED" as const)
      : match.matchStatus === "EXISTING_INSTALLER" ? ("PARTNER_MATCHED" as const)
      : match.matchStatus === "POSSIBLE_DUPLICATE" ? ("POSSIBLE_DUPLICATE" as const)
      : ("NEW_INSTALLER_PROSPECT" as const);

    const consumerLead = await db.consumerLead.create({
      data: {
        brandKey: ctx.brandKey,
        sourceUrl: ctx.sourceUrl?.slice(0, 300),
        name: d.name,
        phone: d.phone,
        email: d.email || null,
        zip: d.zip,
        vehicleJson: d.vehicle ? { raw: d.vehicle } : undefined,
        preferredDate: d.preferredDate ? new Date(d.preferredDate) : null,
        message: d.message || null,
        productId: product?.id ?? null,
        tireSize: d.tireSize || product?.sizeSpec || null,
        quantity: d.quantity,
        kind: "SEND_TO_INSTALLER",
        status: leadStatus,
        installerId: match.installerId ?? null,
        locationId,
        assignedRepId,
        consumerToken: newToken(),
        consents: { create: { kind: "CONTACT", textShown: CONSENT_TEXT, ip: ctx.ip } },
      },
    });
    await logStatus(consumerLead.id, null, "SUBMITTED", "consumer");
    await logStatus(consumerLead.id, "SUBMITTED", consumerLead.status, "system", `match: ${match.matchStatus}${match.matchedName ? ` (${match.matchedName})` : ""}`);

    const referral = await db.installerReferral.create({
      data: {
        consumerLeadId: consumerLead.id,
        rawName: d.installerName,
        rawPhone: d.installerPhone || null,
        rawAddress: d.installerAddress || null,
        rawZip: d.installerZip,
        rawWebsite: d.installerWebsite || null,
        matchStatus: match.matchStatus,
        matchedCustomerId: match.customerId ?? null,
        installerId: match.installerId ?? null,
        secureToken: newToken(),
        expiresAt: new Date(Date.now() + EXPIRY_DAYS * 864e5),
      },
    });

    // Dealer-prospect bridge (addendum #2): new shops enter the standard B2B pipeline
    if (match.matchStatus === "NEW_PROSPECT") {
      const crmLead = await db.lead.create({
        data: {
          companyName: d.installerName,
          phone: d.installerPhone || null,
          source: "CONSUMER_REFERRAL",
          interest: "TRAILER_TIRES",
          notes: `Consumer ${maskName(d.name)} (ZIP ${d.zip}) selected this shop for ${d.quantity}x ${productLine}.`,
          meta: { referralId: referral.id, installerZip: d.installerZip, website: d.installerWebsite || null },
          assignedRepId,
          locationId: brand.locationId,
        },
      });
      await db.consumerLead.update({ where: { id: consumerLead.id }, data: { crmLeadId: crmLead.id } });
      await recordEvent("new_installer_prospect_created", { brandKey: ctx.brandKey, zip: d.installerZip, consumerLeadId: consumerLead.id });
    }
    if (match.matchStatus === "EXISTING_DEALER") {
      await recordEvent("existing_dealer_matched", { brandKey: ctx.brandKey, zip: d.installerZip, consumerLeadId: consumerLead.id });
    }

    const shopRequestUrl = `${ctx.siteUrl}/shop-request/${referral.secureToken}`;
    const matchLabel =
      match.matchStatus === "EXISTING_DEALER" ? `EXISTING DEALER: ${match.matchedName}`
      : match.matchStatus === "EXISTING_INSTALLER" ? `KNOWN INSTALLER: ${match.matchedName}`
      : match.matchStatus === "POSSIBLE_DUPLICATE" ? `POSSIBLE MATCH: ${match.matchedName} — verify before outreach`
      : "NEW PROSPECT — dealer development opportunity";

    await notifyCrm({
      locationId: brand.locationId,
      title: `Send-to-Installer: ${d.installerName}`,
      body: `${matchLabel}\nConsumer ${maskName(d.name)} (ZIP ${d.zip}) wants ${d.quantity}x ${productLine} installed at "${d.installerName}" (${d.installerZip}).\nShare this secure page with the shop: ${shopRequestUrl}`,
      link: `/consumer-leads?focus=${consumerLead.id}`,
      assignedRepId,
      taskPriority: match.matchStatus === "POSSIBLE_DUPLICATE" ? "HIGH" : "URGENT",
    });

    // Direct outreach when we already have the dealer's email on file (spec §11 outreach)
    if (match.matchStatus === "EXISTING_DEALER" && match.customerId) {
      const customer = await db.customer.findUnique({ where: { id: match.customerId }, select: { email: true, companyName: true } });
      if (customer?.email) {
        const r = await sendEmail(
          customer.email,
          `A customer near ${d.installerZip} selected ${customer.companyName} for installation`,
          `A customer in your area selected your shop and requested ${d.quantity}x ${productLine}.\n\nWe may have this product available from our ${brand.name} warehouse and can provide your business with wholesale pricing.\n\nReview the request and accept or decline here:\n${shopRequestUrl}\n\n— ${brand.name}, ${brand.phoneDisplay}`,
        );
        if (r.sent) {
          await db.installerReferral.update({ where: { id: referral.id }, data: { status: "CONTACTED", contactedAt: new Date() } });
          await db.consumerLead.update({ where: { id: consumerLead.id }, data: { status: "INSTALLER_CONTACTED" } });
          await logStatus(consumerLead.id, consumerLead.status, "INSTALLER_CONTACTED", "system", "outreach email sent");
          await recordEvent("installer_contacted", { brandKey: ctx.brandKey, zip: d.installerZip, consumerLeadId: consumerLead.id });
        }
      }
    }

    await recordEvent("send_to_installer_completed", { brandKey: ctx.brandKey, zip: d.zip, productId: product?.id, consumerLeadId: consumerLead.id });
    return { ok: true, consumerToken: consumerLead.consumerToken };
  },

  /** Installer's secure view. Masked until accepted (spec §11/§21). */
  async getForInstaller(secureToken: string) {
    if (!secureToken || secureToken.length < 20) return null;
    const r = await db.installerReferral.findUnique({
      where: { secureToken },
      include: {
        consumerLead: {
          select: {
            id: true, name: true, phone: true, email: true, zip: true, quantity: true, preferredDate: true,
            kind: true, status: true, tireSize: true, message: true,
            product: { select: { name: true, description: true, sku: true, sizeSpec: true } },
          },
        },
      },
    });
    if (!r) return null;

    if (r.expiresAt < new Date() && !["ACCEPTED", "DECLINED", "COMPLETED", "EXPIRED"].includes(r.status)) {
      await db.installerReferral.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
      await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "EXPIRED" } });
      await logStatus(r.consumerLeadId, r.consumerLead.status, "EXPIRED", "system", "referral window elapsed");
      await recordEvent("referral_expired", { consumerLeadId: r.consumerLeadId });
      return { state: "EXPIRED" as const };
    }

    if (r.status === "PENDING" || r.status === "CONTACTED") {
      await db.installerReferral.update({ where: { id: r.id }, data: { status: "OPENED", openedAt: r.openedAt ?? new Date() } });
      await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "INSTALLER_REQUEST_OPENED" } });
      await logStatus(r.consumerLeadId, r.consumerLead.status, "INSTALLER_REQUEST_OPENED", "installer");
      await recordEvent("installer_request_opened", { consumerLeadId: r.consumerLeadId });
    }

    const lead = r.consumerLead;
    const accepted = r.status === "ACCEPTED" || r.status === "COMPLETED";
    return {
      state: (accepted ? "ACCEPTED" : r.status === "DECLINED" ? "DECLINED" : "OPEN") as "ACCEPTED" | "DECLINED" | "OPEN",
      product: lead.product ? `${lead.product.name ?? lead.product.description} (SKU ${lead.product.sku})` : lead.tireSize ?? "Tires",
      quantity: lead.quantity,
      consumerZip: lead.zip,
      preferredDate: lead.preferredDate,
      notes: lead.message,
      shopName: r.rawName,
      // masked until acceptance; full contact only after
      consumer: accepted
        ? { name: lead.name, phone: lead.phone, email: lead.email }
        : { name: maskName(lead.name), phone: null, email: null },
    };
  },

  async accept(secureToken: string): Promise<{ ok: boolean }> {
    const r = await db.installerReferral.findUnique({
      where: { secureToken },
      include: { consumerLead: { select: { id: true, status: true, name: true, email: true, phone: true, quantity: true, tireSize: true, productId: true, locationId: true, assignedRepId: true, consumerToken: true, brandKey: true } } },
    });
    if (!r || r.expiresAt < new Date() || ["DECLINED", "EXPIRED", "CANCELLED"].includes(r.status)) return { ok: false };
    if (r.status === "ACCEPTED") return { ok: true };

    await db.installerReferral.update({ where: { id: r.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "INSTALLER_ACCEPTED" } });
    await logStatus(r.consumerLeadId, r.consumerLead.status, "INSTALLER_ACCEPTED", "installer");
    await recordEvent("installer_accepted", { consumerLeadId: r.consumerLeadId });

    // Draft wholesale quote for matched dealers (spec §11 existing-dealer workflow)
    const lead = r.consumerLead;
    if (r.matchedCustomerId && lead.assignedRepId) {
      const product = lead.productId
        ? await db.product.findUnique({ where: { id: lead.productId }, select: { sku: true, description: true, brand: true, category: true, sizeSpec: true, priceA: true, priceB: true, priceC: true, priceD: true } })
        : null;
      if (product) {
        const customer = await db.customer.findUnique({ where: { id: r.matchedCustomerId }, select: { tier: true, locationId: true } });
        const tier = customer?.tier ?? "C";
        const raw = tier === "A" ? product.priceA : tier === "B" ? product.priceB : tier === "C" ? product.priceC : product.priceD;
        const unit = raw !== null && raw !== undefined ? Number(raw) : 0;
        const year = new Date().getFullYear();
        const count = await db.quote.count({ where: { quoteNumber: { startsWith: `Q${year}-` } } });
        const quote = await db.quote.create({
          data: {
            quoteNumber: `Q${year}-${String(count + 1).padStart(4, "0")}`,
            status: "DRAFT",
            customerId: r.matchedCustomerId,
            repId: lead.assignedRepId,
            locationId: customer?.locationId ?? lead.locationId,
            notes: `Auto-draft from consumer referral (${lead.quantity}x for consumer ${maskName(lead.name)}).`,
            total: +(unit * lead.quantity).toFixed(2),
            items: {
              create: {
                category: product.category,
                description: product.description,
                sizeSku: product.sizeSpec,
                brand: product.brand,
                quantity: lead.quantity,
                unitPrice: unit,
                lineTotal: +(unit * lead.quantity).toFixed(2),
              },
            },
          },
        });
        await db.installerReferral.update({ where: { id: r.id }, data: { quoteId: quote.id } });
        await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "AWAITING_WHOLESALE_QUOTE" } });
        await logStatus(r.consumerLeadId, "INSTALLER_ACCEPTED", "AWAITING_WHOLESALE_QUOTE", "system", `draft ${quote.quoteNumber}`);
      }
    }

    if (lead.locationId) {
      await notifyCrm({
        locationId: lead.locationId,
        title: `Installer ACCEPTED: ${r.rawName}`,
        body: `"${r.rawName}" accepted the consumer request (${lead.quantity}x ${lead.tireSize ?? "tires"}). Follow up on the wholesale order.`,
        link: `/consumer-leads?focus=${lead.id}`,
        assignedRepId: lead.assignedRepId,
        taskPriority: "URGENT",
      });
    }
    if (lead.email) {
      await sendEmail(
        lead.email,
        "Good news — your tire shop accepted your request",
        `"${r.rawName}" accepted your installation request. They'll contact you shortly at ${lead.phone}.\n\nTrack your request: track it with the link we gave you after submitting.`,
      );
    }
    return { ok: true };
  },

  async decline(secureToken: string, reason?: string): Promise<{ ok: boolean }> {
    const r = await db.installerReferral.findUnique({
      where: { secureToken },
      include: { consumerLead: { select: { id: true, status: true, locationId: true, assignedRepId: true, zip: true } } },
    });
    if (!r || ["ACCEPTED", "COMPLETED", "EXPIRED", "CANCELLED"].includes(r.status)) return { ok: false };
    if (r.status === "DECLINED") return { ok: true };

    await db.installerReferral.update({ where: { id: r.id }, data: { status: "DECLINED", declinedAt: new Date() } });
    await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "INSTALLER_DECLINED" } });
    await logStatus(r.consumerLeadId, r.consumerLead.status, "INSTALLER_DECLINED", "installer", reason);
    await recordEvent("installer_declined", { consumerLeadId: r.consumerLeadId });

    if (r.consumerLead.locationId) {
      await notifyCrm({
        locationId: r.consumerLead.locationId,
        title: `Installer declined: ${r.rawName}`,
        body: `"${r.rawName}" declined. Help the consumer (ZIP ${r.consumerLead.zip}) find another installer — IDEAL or a partner.`,
        link: `/consumer-leads?focus=${r.consumerLeadId}`,
        assignedRepId: r.consumerLead.assignedRepId,
        taskPriority: "URGENT",
      });
    }
    return { ok: true };
  },

  /** "Request Wholesale Price" on the secure page — a dealer-development signal. */
  async requestWholesalePrice(secureToken: string): Promise<{ ok: boolean }> {
    const r = await db.installerReferral.findUnique({
      where: { secureToken },
      include: { consumerLead: { select: { id: true, locationId: true, assignedRepId: true, quantity: true, tireSize: true } } },
    });
    if (!r || r.expiresAt < new Date()) return { ok: false };
    if (r.consumerLead.locationId) {
      await notifyCrm({
        locationId: r.consumerLead.locationId,
        title: `Wholesale price requested: ${r.rawName}`,
        body: `"${r.rawName}" asked for wholesale pricing on ${r.consumerLead.quantity}x ${r.consumerLead.tireSize ?? "tires"} — call them (${r.rawPhone ?? "phone on file"}) and open the dealer conversation.`,
        link: `/consumer-leads?focus=${r.consumerLeadId}`,
        assignedRepId: r.consumerLead.assignedRepId,
        taskPriority: "URGENT",
      });
    }
    await recordEvent("wholesale_quote_requested", { consumerLeadId: r.consumerLeadId });
    return { ok: true };
  },
};
