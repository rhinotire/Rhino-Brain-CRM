import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, isManager, locationScope } from "@/lib/auth";
import {
  customerTypeLabels, customerStatusLabels, customerSourceLabels, productLabels,
  stageLabels, activityTypeLabels, quoteStatusLabels,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

function csv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function respond(name: string, body: string) {
  return new NextResponse("\uFEFF" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");

export async function GET(_req: Request, { params }: { params: { entity: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Data-protection policy: sales reps cannot bulk-export. Managers and admins only.
  if (!isManager(session)) {
    return new Response("Exports are limited to managers and admins.", { status: 403 });
  }
  const scope = isManager(session) ? {} : undefined; // rep scoping applied per-entity below
  const repFilter = (field: string) => ({ ...(scope ? {} : { [field]: session.userId }), ...locationScope(session) });

  switch (params.entity) {
    case "customers": {
      const rows = await db.customer.findMany({
        where: repFilter("assignedRepId"),
        include: { assignedRep: { select: { name: true } } },
        orderBy: { companyName: "asc" },
      });
      return respond("customers", csv(
        ["Company Name", "Contact Person", "Phone", "Email", "Address", "City", "State", "Zip", "Type", "Status", "Source", "Interest", "Tier", "Assigned Rep", "Last Contact", "Next Follow-up", "Score", "Created"],
        rows.map(c => [
          c.companyName, c.contactPerson, c.phone, c.email, c.address, c.city, c.state, c.zip,
          customerTypeLabels[c.type], customerStatusLabels[c.status], customerSourceLabels[c.source],
          productLabels[c.mainInterest], c.tier, c.assignedRep?.name ?? "", d(c.lastContactAt), d(c.nextFollowUpAt), c.score, d(c.createdAt),
        ]),
      ));
    }
    case "leads": {
      const rows = await db.lead.findMany({
        where: repFilter("assignedRepId"),
        include: { assignedRep: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return respond("leads", csv(
        ["Company Name", "Contact Person", "Phone", "Email", "City", "State", "Type", "Source", "Interest", "Stage", "Assigned Rep", "Created", "Next Follow-up"],
        rows.map(l => [
          l.companyName, l.contactPerson, l.phone, l.email, l.city, l.state,
          customerTypeLabels[l.type], customerSourceLabels[l.source], productLabels[l.interest],
          stageLabels[l.stage], l.assignedRep?.name ?? "", d(l.createdAt), d(l.nextFollowUpAt),
        ]),
      ));
    }
    case "activities": {
      const rows = await db.activity.findMany({
        where: repFilter("repId"),
        include: { rep: { select: { name: true } }, customer: { select: { companyName: true } }, lead: { select: { companyName: true } } },
        orderBy: { occurredAt: "desc" },
        take: 5000,
      });
      return respond("activities", csv(
        ["Date/Time", "Type", "Account", "Rep", "Meaningful", "Notes"],
        rows.map(a => [
          a.occurredAt.toISOString(), activityTypeLabels[a.type],
          a.customer?.companyName ?? a.lead?.companyName ?? "", a.rep.name, a.meaningful ? "Yes" : "No", a.notes,
        ]),
      ));
    }
    case "quotes": {
      const rows = await db.quote.findMany({
        where: repFilter("repId"),
        include: { rep: { select: { name: true } }, customer: { select: { companyName: true } }, items: true },
        orderBy: { quoteDate: "desc" },
      });
      return respond("quotes", csv(
        ["Quote #", "Customer", "Rep", "Date", "Status", "Total", "Items", "Competitor Price", "Competitor Brand", "Sent", "Next Follow-up"],
        rows.map(q => [
          q.quoteNumber, q.customer.companyName, q.rep.name, d(q.quoteDate), quoteStatusLabels[q.status],
          Number(q.total).toFixed(2),
          q.items.map(i => `${i.quantity}x ${i.description}${i.sizeSku ? ` (${i.sizeSku})` : ""} @${Number(i.unitPrice).toFixed(2)}`).join(" | "),
          q.competitorPrice ? Number(q.competitorPrice).toFixed(2) : "", q.competitorBrand,
          d(q.sentAt), d(q.nextFollowUpAt),
        ]),
      ));
    }
    default:
      return NextResponse.json({ error: "Unknown export entity" }, { status: 404 });
  }
}
