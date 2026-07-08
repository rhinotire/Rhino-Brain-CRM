import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, isManager, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard, Select, Button, Input } from "@/components/ui/primitives";
import { fmtMoney, fmtDate } from "@/lib/domain";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { q?: string; bucket?: string; rep?: string };

const BUCKETS = [
  { key: "current", label: "Not yet due", min: -Infinity, max: 0 },
  { key: "b30", label: "1-30d past due", min: 1, max: 30 },
  { key: "b60", label: "31-60d past due", min: 31, max: 60 },
  { key: "b90", label: "61-90d past due", min: 61, max: 90 },
  { key: "b120", label: "91-120d past due", min: 91, max: 120 },
  { key: "b120plus", label: "120d+ past due", min: 121, max: Infinity },
] as const;

function overdueDays(dueDate: Date, now: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
}
function bucketOf(days: number) {
  return BUCKETS.find(b => days >= b.min && days <= b.max) ?? BUCKETS[0];
}

export default async function ARAgingPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const manager = isManager(session);
  const now = new Date();

  const where: Prisma.InvoiceWhereInput = {
    balance: { gt: 0 },
    ...(Object.keys(locationScope(session)).length ? { locationId: locationScope(session).locationId } : {}),
  };
  // Reps only see A/R for their own customers.
  if (!manager) where.customer = { assignedRepId: session.userId };
  else if (searchParams.rep) where.customer = { assignedRepId: searchParams.rep };
  const q = searchParams.q?.trim();
  if (q) where.customerName = { contains: q, mode: "insensitive" };

  const [invoices, reps] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { dueDate: "asc" },
      include: {
        customer: { select: { id: true, companyName: true, assignedRep: { select: { name: true } } } },
        location: { select: { shortTag: true } },
      },
    }),
    manager ? db.user.findMany({ where: { active: true, role: "SALES_REP" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const withBucket = invoices.map(inv => {
    const days = overdueDays(inv.dueDate, now);
    return { inv, days, bucket: bucketOf(days) };
  });

  const totals = BUCKETS.map(b => ({
    ...b,
    sum: withBucket.filter(x => x.bucket.key === b.key).reduce((s, x) => s + Number(x.inv.balance), 0),
    count: withBucket.filter(x => x.bucket.key === b.key).length,
  }));
  const grandTotal = totals.reduce((s, t) => s + t.sum, 0);
  const pastDueTotal = totals.filter(t => t.key !== "current").reduce((s, t) => s + t.sum, 0);

  const filtered = searchParams.bucket
    ? withBucket.filter(x => x.bucket.key === searchParams.bucket)
    : withBucket;
  // Worst first: most overdue at the top.
  filtered.sort((a, b) => b.days - a.days);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{manager ? "A/R Aging" : "My A/R"} <span className="text-sm font-normal text-slate-400">({invoices.length} open invoices)</span></h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total outstanding" value={fmtMoney(grandTotal)} />
        <StatCard label="Total past due" value={fmtMoney(pastDueTotal)} tone={pastDueTotal > 0 ? "danger" : "good"} />
        {totals.map(t => (
          <StatCard key={t.key} label={t.label} value={fmtMoney(t.sum)} hint={`${t.count} invoices`}
            tone={t.key === "current" ? "default" : t.key === "b30" ? "warn" : "danger"} />
        ))}
      </div>

      <form className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-5">
        <Input name="q" placeholder="Search customer name" defaultValue={searchParams.q} className="col-span-2" />
        <Select name="bucket" defaultValue={searchParams.bucket ?? ""}>
          <option value="">All buckets</option>
          {BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </Select>
        {manager && (
          <Select name="rep" defaultValue={searchParams.rep ?? ""}>
            <option value="">All reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Table>
        <THead cols={["Customer", "Rep", "Aging", "Days Past Due", "Amount", "Balance", "Due Date", "Location"]} />
        <tbody>
          {filtered.map(({ inv, days, bucket }) => (
            <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                {inv.customer
                  ? <Link href={`/customers/${inv.customer.id}`} className="text-brand-700 hover:underline">{inv.customerName}</Link>
                  : inv.customerName}
              </td>
              <td className="px-3 py-2 text-slate-600">{inv.customer?.assignedRep?.name ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge className={bucket.key === "current" ? "bg-emerald-100 text-emerald-700"
                  : bucket.key === "b30" ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"}>{bucket.label}</Badge>
              </td>
              <td className="px-3 py-2 tabular-nums">{days > 0 ? <span className="font-semibold text-red-600">{days}</span> : "—"}</td>
              <td className="px-3 py-2 tabular-nums">{fmtMoney(Number(inv.amount))}</td>
              <td className="px-3 py-2 font-semibold tabular-nums">{fmtMoney(Number(inv.balance))}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
              <td className="px-3 py-2">{inv.location?.shortTag ?? "—"}</td>
            </tr>
          ))}
          {filtered.length === 0 && <EmptyRow colSpan={8} message="No open invoices in this view." />}
        </tbody>
      </Table>
      <p className="text-xs text-slate-400">Aging is computed from each invoice&apos;s due date as of today. Imported from the accounting export on Jul 7, 2026.</p>
    </div>
  );
}
