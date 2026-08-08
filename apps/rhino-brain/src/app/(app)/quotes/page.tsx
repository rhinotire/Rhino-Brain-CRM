import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Select, Input, Button } from "@/components/ui/primitives";
import { NewQuoteButton, QuoteStatusActions } from "@/components/quote-form";
import { quoteStatusLabels, quoteNeedsFollowUp, fmtDate, fmtMoney } from "@/lib/domain";
import Link from "next/link";
import type { Prisma, QuoteStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { status?: string; rep?: string; customer?: string; from?: string; to?: string };

export default async function QuotesPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const manager = isManager(session);
  const now = new Date();

  const where: Prisma.QuoteWhereInput = { ...repScope(session, "repId"), ...locationScope(session) };
  if (searchParams.status && searchParams.status !== "FOLLOW_UP_NEEDED") where.status = searchParams.status as QuoteStatus;
  if (manager && searchParams.rep) where.repId = searchParams.rep;
  if (searchParams.customer) where.customer = { companyName: { contains: searchParams.customer, mode: "insensitive" } };
  if (searchParams.from) where.quoteDate = { gte: new Date(searchParams.from) };
  if (searchParams.to) where.quoteDate = { ...(where.quoteDate as object), lte: new Date(searchParams.to) };

  const [quotesRaw, customers, reps] = await Promise.all([
    db.quote.findMany({
      where, orderBy: { quoteDate: "desc" }, take: 200,
      include: {
        customer: { select: { id: true, companyName: true } },
        rep: { select: { name: true } },
        items: { select: { description: true, sizeSku: true, brand: true, quantity: true } },
      },
    }),
    db.customer.findMany({ where: { ...repScope(session), ...locationScope(session) }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" }, take: 500 }),
    manager ? db.user.findMany({ where: { active: true, ...locationScope(session) }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  // Apply the "sent 3+ days, no follow-up" business rule as a virtual status
  const quotes = quotesRaw.map(q => ({
    ...q,
    effectiveStatus: quoteNeedsFollowUp(q, now) ? ("FOLLOW_UP_NEEDED" as QuoteStatus) : q.status,
  })).filter(q => searchParams.status === "FOLLOW_UP_NEEDED" ? q.effectiveStatus === "FOLLOW_UP_NEEDED" : true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{manager ? "Quotes" : "My Quotes"} <span className="text-sm font-normal text-slate-400">({quotes.length})</span></h1>
        <div className="flex gap-2">
          <a href="/api/export/quotes" className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>
          <NewQuoteButton customers={customers} />
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-44">
          <Select name="status" defaultValue={searchParams.status ?? ""}>
            <option value="">All statuses</option>
            {Object.entries(quoteStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        {manager && (
          <div className="w-40">
            <Select name="rep" defaultValue={searchParams.rep ?? ""}>
              <option value="">All reps</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
        )}
        <div className="w-48"><Input name="customer" placeholder="Customer name…" defaultValue={searchParams.customer} /></div>
        <div className="w-[150px]"><Input name="from" type="date" defaultValue={searchParams.from} /></div>
        <div className="w-[150px]"><Input name="to" type="date" defaultValue={searchParams.to} /></div>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Table>
        <THead cols={["Quote #", "Customer", "Items", "Total", "Rep", "Date", "Status", "Next F/U", "Actions"]} />
        <tbody>
          {quotes.map(q => (
            <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">{q.quoteNumber}</td>
              <td className="px-3 py-2"><Link href={`/customers/${q.customer.id}`} className="text-brand-700 hover:underline">{q.customer.companyName}</Link></td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {q.items.slice(0, 2).map((i, x) => <div key={x}>{i.quantity}× {i.brand ? `${i.brand} ` : ""}{i.description}{i.sizeSku ? ` (${i.sizeSku})` : ""}</div>)}
                {q.items.length > 2 && <div>+{q.items.length - 2} more…</div>}
              </td>
              <td className="px-3 py-2 font-semibold tabular-nums">{fmtMoney(Number(q.total))}</td>
              <td className="px-3 py-2 text-slate-600">{q.rep.name}</td>
              <td className="px-3 py-2">{fmtDate(q.quoteDate)}</td>
              <td className="px-3 py-2">
                <Badge className={
                  q.effectiveStatus === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" :
                  q.effectiveStatus === "REJECTED" || q.effectiveStatus === "EXPIRED" ? "bg-red-100 text-red-700" :
                  q.effectiveStatus === "FOLLOW_UP_NEEDED" ? "bg-amber-100 text-amber-800" :
                  q.effectiveStatus === "SENT" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"
                }>{quoteStatusLabels[q.effectiveStatus]}</Badge>
              </td>
              <td className="px-3 py-2">{fmtDate(q.nextFollowUpAt)}</td>
              <td className="px-3 py-2"><QuoteStatusActions quoteId={q.id} status={q.status} /></td>
            </tr>
          ))}
          {quotes.length === 0 && <EmptyRow colSpan={9} message="No quotes match. Create your first quote above." />}
        </tbody>
      </Table>
    </div>
  );
}
