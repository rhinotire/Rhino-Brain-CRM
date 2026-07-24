import { db, Prisma } from "@rhino/database";
import { notifyCrm } from "./crm-notify";
import type { DealerIdentity } from "./dealer-auth-service";

/**
 * Portal order intake (dealer portal Phase 2). A request is NOT a confirmed
 * sale: reps confirm it and key it into TireGuru (the ledger of record), then
 * advance the status in the CRM. Prices are ALWAYS re-resolved server-side at
 * the dealer's tier — client-supplied prices are ignored by design.
 */

export type DealerOrderInput = {
  items: { sku: string; quantity: number }[];
  poNumber?: string;
  notes?: string;
};

export type DealerOrderResult =
  | { ok: true; requestNumber: string }
  | { ok: false; error: string };

export type DealerOrderSummary = {
  requestNumber: string;
  status: "SUBMITTED" | "CONFIRMED" | "FULFILLED" | "CANCELLED";
  poNumber: string | null;
  total: number;
  createdAt: Date;
  items: { sku: string; description: string; sizeSpec: string | null; quantity: number; unitPrice: number; lineTotal: number }[];
};

const MAX_LINES = 100;
const MAX_QTY = 2000; // per line; container-scale orders still go through a rep

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : Number(d));

export const DealerOrderService = {
  async submit(identity: DealerIdentity, input: DealerOrderInput): Promise<DealerOrderResult> {
    const lines = input.items.filter((i) => i.sku && Number.isInteger(i.quantity) && i.quantity > 0);
    if (!lines.length) return { ok: false, error: "Your order is empty." };
    if (lines.length > MAX_LINES) return { ok: false, error: `Too many line items (max ${MAX_LINES}) — send the list via Quick Order instead.` };
    if (lines.some((i) => i.quantity > MAX_QTY)) return { ok: false, error: `Quantities over ${MAX_QTY} per SKU: place through your rep.` };

    const products = await db.product.findMany({
      where: { sku: { in: lines.map((l) => l.sku) }, visibility: "PUBLIC", active: true },
      select: { id: true, sku: true, description: true, name: true, priceA: true, priceB: true, priceC: true, priceD: true },
    });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const missing = lines.filter((l) => !bySku.has(l.sku));
    if (missing.length) return { ok: false, error: `Not orderable online: ${missing.map((m) => m.sku).join(", ")} — ask your rep.` };

    const priced = lines.map((l) => {
      const p = bySku.get(l.sku)!;
      const unit = num(p[`price${identity.tier}` as const]) ?? num(p.priceA);
      return { product: p, quantity: l.quantity, unitPrice: unit };
    });
    const unpriced = priced.filter((l) => l.unitPrice === null);
    if (unpriced.length) {
      return { ok: false, error: `No portal price for: ${unpriced.map((l) => l.product.sku).join(", ")} — ask your rep to quote these.` };
    }

    const total = priced.reduce((s, l) => s + l.unitPrice! * l.quantity, 0);
    const requestNumber = `DR-${Date.now().toString(36).toUpperCase()}`;

    const customer = await db.customer.findUnique({
      where: { id: identity.customerId },
      select: { assignedRepId: true, locationId: true, companyName: true },
    });

    await db.dealerOrderRequest.create({
      data: {
        requestNumber,
        customerId: identity.customerId,
        dealerUserId: identity.dealerUserId,
        poNumber: input.poNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        total,
        items: {
          create: priced.map((l) => ({
            productId: l.product.id,
            sku: l.product.sku,
            description: l.product.name ?? l.product.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice!,
            lineTotal: l.unitPrice! * l.quantity,
          })),
        },
      },
    });

    if (customer?.locationId) {
      await notifyCrm({
        locationId: customer.locationId,
        title: `Portal order ${requestNumber} — ${customer.companyName}`,
        body: `${priced.length} line${priced.length > 1 ? "s" : ""}, ${priced.reduce((s, l) => s + l.quantity, 0)} units, $${total.toFixed(2)} at dealer pricing. Confirm and key into TireGuru.`,
        link: `/portal-orders`,
        assignedRepId: customer.assignedRepId,
        taskPriority: "URGENT",
      }).catch(() => {}); // notification failure must never lose the order
    }

    return { ok: true, requestNumber };
  },

  /** Order history, own-customer scope only. */
  async listForCustomer(customerId: string, take = 50): Promise<DealerOrderSummary[]> {
    const rows = await db.dealerOrderRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take,
      include: { items: { include: { product: { select: { sizeSpec: true } } } } },
    });
    return rows.map((r) => ({
      requestNumber: r.requestNumber,
      status: r.status,
      poNumber: r.poNumber,
      total: Number(r.total),
      createdAt: r.createdAt,
      items: r.items.map((i) => ({
        sku: i.sku,
        description: i.description,
        sizeSpec: i.product?.sizeSpec ?? null,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
    }));
  },
};
