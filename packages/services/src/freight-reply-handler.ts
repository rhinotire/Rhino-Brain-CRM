/**
 * Routes one inbound email to its FreightQuote row (spec §4): refCode in the
 * subject finds the shipment; the From address must match one of that
 * shipment's carrier contacts. Unmatched mail is skipped, never guessed at.
 */
import { db as defaultDb } from "@rhino/database";
import { extractFreightQuote, type ParsedFreightReply } from "./freight-parse";
import { equipmentLabel } from "./freight-email-templates";

const REF_RE = /RT-\d{4}-\d{3}/;

type Deps = {
  db?: any;
  extract?: (text: string, ctx: { refCode: string; route: string; equipment: string }) => Promise<ParsedFreightReply | null>;
};

export async function handleFreightReply(
  msg: { subject: string; fromEmail: string; text: string },
  deps: Deps = {}
): Promise<{ handled: boolean; reason?: string }> {
  const db = deps.db ?? defaultDb;
  const extract = deps.extract ?? extractFreightQuote;

  const refCode = msg.subject.match(REF_RE)?.[0];
  if (!refCode) return { handled: false, reason: "no refCode" };

  const shipment = await db.freightShipment.findUnique({
    where: { refCode },
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: { include: { carrier: { include: { contacts: true } } } },
    },
  });
  if (!shipment) return { handled: false, reason: "unknown refCode" };

  const from = msg.fromEmail.toLowerCase();
  const quote = shipment.quotes.find((q: any) =>
    q.carrier.contacts.some((c: any) => c.email.toLowerCase() === from)
  );
  if (!quote) return { handled: false, reason: "sender not a carrier contact" };

  const route = `${shipment.originLabel} -> ${shipment.stops.map((s: any) => `${s.consignee.city} ${s.consignee.state}`).join(" + ")}`;
  const parsed = await extract(msg.text, { refCode, route, equipment: equipmentLabel(shipment.equipmentType) });

  const base = {
    repliedAt: new Date(),
    rawReplyExcerpt: msg.text.slice(0, 1000),
    parsedByAi: parsed !== null,
  };
  if (parsed === null) {
    await db.freightQuote.update({ where: { id: quote.id }, data: { ...base, status: "NEEDS_ATTENTION" } });
  } else if (parsed.verdict === "QUOTED") {
    await db.freightQuote.update({
      where: { id: quote.id },
      data: { ...base, status: "QUOTED", price: parsed.price, transitDays: parsed.transitDays, notes: parsed.notes || null },
    });
  } else if (parsed.verdict === "DECLINED") {
    await db.freightQuote.update({ where: { id: quote.id }, data: { ...base, status: "DECLINED", notes: parsed.notes || null } });
  } else {
    await db.freightQuote.update({ where: { id: quote.id }, data: { ...base, status: "NEEDS_ATTENTION", notes: parsed.notes || null } });
  }
  return { handled: true };
}
