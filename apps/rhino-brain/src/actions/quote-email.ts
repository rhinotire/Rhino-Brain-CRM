"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, repScope, locationScope } from "@/lib/auth";
import { sendEmail, isEmailConfigured } from "@rhino/services";
import { generateQuotePdf } from "@/lib/quote-pdf";
import { fmtMoney, fmtDate } from "@/lib/domain";
import type { ActionResult } from "./auth";

/** Generate a branded PDF and email it to the customer (from the company mailbox), then log the activity. */
export async function emailQuote(quoteId: string): Promise<ActionResult> {
  const session = await requireSession();
  const quote = await db.quote.findFirst({
    where: { id: quoteId, ...repScope(session, "repId"), ...locationScope(session) },
    include: {
      items: true,
      rep: { select: { name: true } },
      customer: { select: { companyName: true, contactPerson: true, address: true, city: true, state: true, zip: true, email: true, phone: true } },
    },
  });
  if (!quote) return { ok: false, error: "Quote not found." };
  const c = quote.customer;
  if (!c?.email) return { ok: false, error: "This customer has no email on file — add one, or use WhatsApp / Print." };
  if (!isEmailConfigured()) return { ok: false, error: "Email isn't set up yet — admin: add ZOHO_SMTP_USER / ZOHO_SMTP_PASS. You can still Print or WhatsApp." };

  const brand = quote.locationId ? await db.brandConfig.findFirst({ where: { locationId: quote.locationId } }) : null;
  const loc = quote.locationId ? await db.location.findUnique({ where: { id: quote.locationId }, select: { name: true } }) : null;
  const company = brand?.name ?? loc?.name ?? "Rhino Tire USA";

  const pdf = await generateQuotePdf({
    quoteNumber: quote.quoteNumber,
    quoteDate: fmtDate(quote.quoteDate),
    expiration: quote.expirationDate ? fmtDate(quote.expirationDate) : null,
    company, companyPhone: brand?.phoneDisplay, companyEmail: brand?.contactEmail,
    customerName: c.companyName, contactPerson: c.contactPerson,
    address: [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" · ") || null,
    customerContact: [c.phone, c.email].filter(Boolean).join(" · ") || null,
    items: quote.items.map(it => ({ description: it.description, sizeSku: it.sizeSku, brand: it.brand, quantity: it.quantity, unitPrice: Number(it.unitPrice), lineTotal: Number(it.lineTotal) })),
    total: Number(quote.total),
    notes: quote.notes,
    repName: quote.rep?.name,
    competitor: quote.competitorBrand,
    competitorPrice: quote.competitorPrice != null ? Number(quote.competitorPrice) : null,
  });

  const hi = c.contactPerson ? `Hi ${c.contactPerson},` : "Hello,";
  const body = `${hi}\n\nPlease find attached quote ${quote.quoteNumber} from ${company} — total ${fmtMoney(Number(quote.total))}.\nLet me know if you'd like to proceed or have any questions.\n\nThank you,\n${quote.rep?.name ?? ""}\n${company}`;

  const res = await sendEmail(c.email, `Quote ${quote.quoteNumber} — ${company}`, body, {
    attachments: [{ filename: `Quote-${quote.quoteNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
    replyTo: session.email,
  });
  if (!res.sent) return { ok: false, error: "Email failed to send — check mail settings, or use Print / WhatsApp." };

  await db.activity.create({ data: { type: "EMAIL", subject: `Quote ${quote.quoteNumber} emailed to ${c.email}`, customerId: quote.customerId, repId: session.userId, quoteId: quote.id, locationId: quote.locationId, meaningful: true } });
  await db.customer.update({ where: { id: quote.customerId }, data: { lastContactAt: new Date() } });
  // Emailing sends the quote: promote DRAFT→SENT and refresh the follow-up clock (never touch a decided quote).
  await db.quote.updateMany({ where: { id: quote.id, status: { in: ["DRAFT", "SENT"] } }, data: { status: "SENT", sentAt: quote.sentAt ?? new Date(), lastFollowUpAt: new Date() } });

  revalidatePath("/quotes");
  return { ok: true };
}
