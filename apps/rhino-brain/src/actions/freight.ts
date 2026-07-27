"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildQuoteRequestEmail,
  buildConfirmationEmail,
  buildRegretEmail,
  sendFreightEmail,
  pollFreightInbox,
  refCodePrefix,
  nextRefCode,
  type FreightEmailInput,
  type FreightStopInfo,
} from "@rhino/services";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

// ---------- carriers / consignees ----------

const contactSchema = z.object({ id: z.string().optional(), name: z.string().optional(), email: z.string().email(), active: z.boolean().default(true) });
const carrierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  mcNumber: z.string().optional(),
  equipmentTypes: z.array(z.enum(["DRY_VAN_53", "FLATBED_53"])).min(1),
  notes: z.string().optional(),
  active: z.boolean().default(true),
  contacts: z.array(contactSchema).min(1),
});

export async function saveCarrier(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const p = carrierSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, contacts, ...data } = p.data;
  if (id) {
    await db.$transaction([
      db.freightCarrier.update({ where: { id }, data }),
      db.freightCarrierContact.deleteMany({ where: { carrierId: id, id: { notIn: contacts.filter((c) => c.id).map((c) => c.id!) } } }),
      ...contacts.map((c) =>
        c.id
          ? db.freightCarrierContact.update({ where: { id: c.id }, data: { name: c.name || null, email: c.email, active: c.active } })
          : db.freightCarrierContact.create({ data: { carrierId: id, name: c.name || null, email: c.email, active: c.active } })
      ),
    ]);
  } else {
    await db.freightCarrier.create({ data: { ...data, contacts: { create: contacts.map((c) => ({ name: c.name || null, email: c.email, active: c.active })) } } });
  }
  revalidatePath("/freight/carriers");
  return { ok: true };
}

export async function deleteCarrier(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const used = await db.freightQuote.count({ where: { carrierId: id } });
  if (used > 0) {
    await db.freightCarrier.update({ where: { id }, data: { active: false } }); // keep history, hide from new blasts
  } else {
    await db.freightCarrier.delete({ where: { id } });
  }
  revalidatePath("/freight/carriers");
  return { ok: true };
}

const consigneeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  addressLine: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(5),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  deliveryNotes: z.string().optional(),
  active: z.boolean().default(true),
});

export async function saveConsignee(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const p = consigneeSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, ...data } = p.data;
  const clean = { ...data, contactName: data.contactName || null, phone: data.phone || null, deliveryNotes: data.deliveryNotes || null };
  if (id) await db.freightConsignee.update({ where: { id }, data: clean });
  else await db.freightConsignee.create({ data: clean });
  revalidatePath("/freight/consignees");
  return { ok: true };
}

export async function deleteConsignee(id: string): Promise<{ ok: boolean }> {
  await requireManager();
  const used = await db.freightShipmentStop.count({ where: { consigneeId: id } });
  if (used > 0) await db.freightConsignee.update({ where: { id }, data: { active: false } });
  else await db.freightConsignee.delete({ where: { id } });
  revalidatePath("/freight/consignees");
  return { ok: true };
}

// ---------- shipments ----------

const shipmentSchema = z.object({
  originAddress: z.string().min(5),
  originLabel: z.string().min(2),
  equipmentType: z.enum(["DRY_VAN_53", "FLATBED_53"]),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commodity: z.string().default("tires"),
  notes: z.string().optional(),
  stops: z.array(z.object({ consigneeId: z.string(), quantity: z.string().optional(), notes: z.string().optional() })).min(1),
  carrierIds: z.array(z.string()).min(1),
});
export type ShipmentInput = z.infer<typeof shipmentSchema>;

async function emailInputFor(input: ShipmentInput, refCode: string): Promise<FreightEmailInput> {
  const consignees = await db.freightConsignee.findMany({ where: { id: { in: input.stops.map((s) => s.consigneeId) } } });
  const byId = new Map(consignees.map((c) => [c.id, c]));
  const stops: FreightStopInfo[] = input.stops.map((s, i) => {
    const c = byId.get(s.consigneeId);
    if (!c) throw new Error("Unknown consignee");
    return {
      sequence: i + 1,
      name: c.name,
      addressLine: c.addressLine,
      city: c.city,
      state: c.state,
      zip: c.zip,
      contactName: c.contactName,
      phone: c.phone,
      quantity: s.quantity || null,
      notes: s.notes || c.deliveryNotes || null,
    };
  });
  return {
    refCode,
    originAddress: input.originAddress,
    originLabel: input.originLabel,
    equipment: input.equipmentType,
    pickupDateISO: input.pickupDate,
    commodity: input.commodity,
    stops,
    notes: input.notes || null,
  };
}

/** Rebuild the email input from a stored shipment (for resend/award/confirmation). */
function emailInputFromShipment(s: {
  refCode: string; originAddress: string; originLabel: string; equipmentType: "DRY_VAN_53" | "FLATBED_53";
  pickupDate: Date; commodity: string; notes: string | null;
  stops: Array<{ sequence: number; quantity: string | null; notes: string | null; consignee: { name: string; addressLine: string; city: string; state: string; zip: string; contactName: string | null; phone: string | null; deliveryNotes: string | null } }>;
}): FreightEmailInput {
  return {
    refCode: s.refCode,
    originAddress: s.originAddress,
    originLabel: s.originLabel,
    equipment: s.equipmentType,
    pickupDateISO: s.pickupDate.toISOString().slice(0, 10),
    commodity: s.commodity,
    notes: s.notes,
    stops: s.stops.map((st) => ({
      sequence: st.sequence,
      name: st.consignee.name,
      addressLine: st.consignee.addressLine,
      city: st.consignee.city,
      state: st.consignee.state,
      zip: st.consignee.zip,
      contactName: st.consignee.contactName,
      phone: st.consignee.phone,
      quantity: st.quantity,
      notes: st.notes ?? st.consignee.deliveryNotes,
    })),
  };
}

/** Preview for the /freight/new form — same builder the real send uses. */
export async function previewQuoteEmail(raw: unknown): Promise<{ subject: string; body: string; error?: string }> {
  await requireManager();
  const p = shipmentSchema.safeParse(raw);
  if (!p.success) return { subject: "", body: "", error: p.error.issues[0].message };
  const emailInput = await emailInputFor(p.data, "RT-XXXX-XXX (assigned on send)");
  return buildQuoteRequestEmail(emailInput);
}

export async function createShipmentAndSend(raw: unknown): Promise<{ ok: boolean; shipmentId?: string; error?: string }> {
  const session = await requireManager();
  const p = shipmentSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const input = p.data;

  const prefix = refCodePrefix(new Date());
  const latest = await db.freightShipment.findFirst({
    where: { refCode: { startsWith: prefix } },
    orderBy: { refCode: "desc" },
    select: { refCode: true },
  });
  const refCode = nextRefCode(prefix, latest?.refCode ?? null);

  const shipment = await db.freightShipment.create({
    data: {
      refCode,
      originAddress: input.originAddress,
      originLabel: input.originLabel,
      equipmentType: input.equipmentType,
      pickupDate: new Date(`${input.pickupDate}T12:00:00Z`),
      commodity: input.commodity,
      notes: input.notes || null,
      locationId: session.locationId ?? null,
      createdById: session.userId,
      stops: { create: input.stops.map((s, i) => ({ sequence: i + 1, consigneeId: s.consigneeId, quantity: s.quantity || null, notes: s.notes || null })) },
    },
  });

  const emailInput = await emailInputFor(input, refCode);
  const { subject, body } = buildQuoteRequestEmail(emailInput);
  const carriers = await db.freightCarrier.findMany({
    where: { id: { in: input.carrierIds } },
    include: { contacts: { where: { active: true } } },
  });

  // Per-carrier isolation: one bad address/SMTP hiccup never kills the batch.
  for (const carrier of carriers) {
    const to = carrier.contacts.map((c) => c.email);
    if (to.length === 0) {
      await db.freightQuote.create({ data: { shipmentId: shipment.id, carrierId: carrier.id, status: "SEND_FAILED", lastError: "no active contact email" } });
      continue;
    }
    try {
      const r = await sendFreightEmail(to, subject, body);
      await db.freightQuote.create({
        data: r.sent
          ? { shipmentId: shipment.id, carrierId: carrier.id, status: "SENT", sentAt: new Date() }
          : { shipmentId: shipment.id, carrierId: carrier.id, status: "SEND_FAILED", lastError: r.error ?? "send failed" },
      });
    } catch (e) {
      await db.freightQuote.create({
        data: { shipmentId: shipment.id, carrierId: carrier.id, status: "SEND_FAILED", lastError: e instanceof Error ? e.message : "send failed" },
      });
    }
  }

  revalidatePath("/freight");
  return { ok: true, shipmentId: shipment.id };
}

export async function resendQuote(quoteId: string): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const quote = await db.freightQuote.findUnique({
    where: { id: quoteId },
    include: {
      carrier: { include: { contacts: { where: { active: true } } } },
      shipment: { include: { stops: { include: { consignee: true }, orderBy: { sequence: "asc" } } } },
    },
  });
  if (!quote || quote.status !== "SEND_FAILED") return { ok: false, error: "Not a failed quote" };
  const { subject, body } = buildQuoteRequestEmail(emailInputFromShipment(quote.shipment));
  const to = quote.carrier.contacts.map((c) => c.email);
  if (to.length === 0) return { ok: false, error: "Carrier has no active contact email" };
  const r = await sendFreightEmail(to, subject, body);
  await db.freightQuote.update({
    where: { id: quoteId },
    data: r.sent ? { status: "SENT", sentAt: new Date(), lastError: null } : { lastError: r.error ?? "send failed" },
  });
  revalidatePath(`/freight/${quote.shipmentId}`);
  return r.sent ? { ok: true } : { ok: false, error: r.error };
}

export async function awardQuote(quoteId: string, opts: { sendRegrets: boolean }): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const quote = await db.freightQuote.findUnique({
    where: { id: quoteId },
    include: {
      carrier: { include: { contacts: { where: { active: true } } } },
      shipment: {
        include: {
          stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
          quotes: { include: { carrier: { include: { contacts: { where: { active: true } } } } } },
        },
      },
    },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "QUOTED") return { ok: false, error: "Carrier has not quoted yet" };
  if (quote.price === null) return { ok: false, error: "Quote has no price" };

  // Race guard: only one award per shipment (same updateMany-count pattern as calibrateLead).
  const { count } = await db.freightShipment.updateMany({
    where: { id: quote.shipmentId, status: "QUOTING" },
    data: { status: "BOOKED", awardedQuoteId: quote.id },
  });
  if (count !== 1) return { ok: false, error: "Shipment already booked or not quotable" };

  const s = quote.shipment;
  const emailInput = emailInputFromShipment(s);
  const conf = buildConfirmationEmail(emailInput, {
    carrierName: quote.carrier.name,
    contactName: quote.carrier.contacts[0]?.name,
    price: Number(quote.price),
  });
  const to = quote.carrier.contacts.map((c) => c.email);
  const r = to.length > 0 ? await sendFreightEmail(to, conf.subject, conf.body) : { sent: false, error: "no active contact" };
  if (r.sent) await db.freightShipment.update({ where: { id: s.id }, data: { confirmationSentAt: new Date() } });

  if (opts.sendRegrets) {
    for (const other of s.quotes) {
      if (other.id === quote.id || other.status !== "QUOTED") continue;
      const otherTo = other.carrier.contacts.map((c) => c.email);
      if (otherTo.length === 0) continue;
      const regret = buildRegretEmail(emailInput, other.carrier.name);
      await sendFreightEmail(otherTo, regret.subject, regret.body).catch(() => {});
    }
  }

  revalidatePath(`/freight/${s.id}`);
  revalidatePath("/freight");
  return r.sent ? { ok: true } : { ok: false, error: `Booked, but confirmation email failed: ${r.error}. Use "重发确认邮件".` };
}

export async function resendConfirmation(shipmentId: string): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const s = await db.freightShipment.findUnique({
    where: { id: shipmentId },
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: { include: { carrier: { include: { contacts: { where: { active: true } } } } } },
    },
  });
  if (!s || s.status !== "BOOKED" || !s.awardedQuoteId) return { ok: false, error: "Shipment is not booked" };
  const quote = s.quotes.find((q) => q.id === s.awardedQuoteId);
  if (!quote || quote.price === null) return { ok: false, error: "Awarded quote missing" };
  const conf = buildConfirmationEmail(emailInputFromShipment(s), {
    carrierName: quote.carrier.name,
    contactName: quote.carrier.contacts[0]?.name,
    price: Number(quote.price),
  });
  const to = quote.carrier.contacts.map((c) => c.email);
  if (to.length === 0) return { ok: false, error: "Carrier has no active contact email" };
  const r = await sendFreightEmail(to, conf.subject, conf.body);
  if (r.sent) await db.freightShipment.update({ where: { id: s.id }, data: { confirmationSentAt: new Date() } });
  revalidatePath(`/freight/${s.id}`);
  return r.sent ? { ok: true } : { ok: false, error: r.error };
}

const TRANSITIONS: Record<string, string[]> = {
  BOOKED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["DELIVERED"],
  QUOTING: ["CANCELLED"],
};

export async function updateShipmentStatus(shipmentId: string, to: "PICKED_UP" | "DELIVERED" | "CANCELLED"): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const s = await db.freightShipment.findUnique({ where: { id: shipmentId }, select: { status: true } });
  if (!s) return { ok: false, error: "Not found" };
  if (!TRANSITIONS[s.status]?.includes(to)) return { ok: false, error: `Cannot go ${s.status} -> ${to}` };
  await db.freightShipment.update({ where: { id: shipmentId }, data: { status: to } });
  revalidatePath(`/freight/${shipmentId}`);
  revalidatePath("/freight");
  return { ok: true };
}

/** Manual price entry / correction — human input supersedes AI (spec §5). */
export async function overrideQuote(quoteId: string, data: { price: number; transitDays?: number | null }): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  if (!Number.isFinite(data.price) || data.price <= 0) return { ok: false, error: "Invalid price" };
  const quote = await db.freightQuote.findUnique({ where: { id: quoteId }, select: { shipmentId: true } });
  if (!quote) return { ok: false, error: "Not found" };
  await db.freightQuote.update({
    where: { id: quoteId },
    data: { status: "QUOTED", price: data.price, transitDays: data.transitDays ?? null, parsedByAi: false },
  });
  revalidatePath(`/freight/${quote.shipmentId}`);
  return { ok: true };
}

/** Manual "check replies now" — same code path as the cron (works on any Vercel plan). */
export async function checkRepliesNow(): Promise<{ processed: number; matched: number }> {
  await requireManager();
  const r = await pollFreightInbox();
  revalidatePath("/freight");
  return r;
}
