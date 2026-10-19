import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting, locationScope , hasPerm } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard, Select, Button, Input } from "@/components/ui/primitives";
import { WriteOffButton } from "@/components/write-off-button";
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
  if (!hasPerm(session, "ar")) redirect("/my-work");
  const seesAll = isManager(session) || isAccounting(session);
  const manager = seesAll; // controls rep filter + rep column
  const now = new Date();

  // 💀 Written-off (closed/uncollectable) customers are excluded from stats and
  // the default list; the "Written off" view shows only them. Invoices with no
  // matched customer can't be written off, so they stay in the default view.
  const writeOffView = searchParams.bucket === "writeoff";
  const and: Prisma.InvoiceWhereInput[] = [
    writeOffView
      ? { customer: { is: { arWriteOffAt: { not: null } } } }
      : { OR: [{ customerId: null }, { customer: { is: { arWriteOffAt: null } } }] },
  ];
  // Only sales reps are limited to their own customers; managers and accounting see all.
  if (session.role === "SALES_REP") and.push({ customer: { is: { assignedRepId: session.userId } } });
  else if (searchParams.rep) and.push({ customer: { is: { assignedRepId: searchParams.rep } } });
  const where: Prisma.InvoiceWhereInput = {
    balance: { not: 0 }, // negative = customer credit / prepayment
    ...(Object.keys(locationScope(session)).length ? { locationId: locationScope(session).locationId } : {}),
    AND: and,
  };
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
    seesAll ? db.user.findMany({ where: { active: true, role: "SALES_REP", ...locationScope(session) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const CREDIT = { key: "credit", label: "Credit / prepaid", min: 0, max: 0 } as const;
  const withBucket = invoices.map(inv => {
    const days = overdueDays(inv.dueDate, now);
    const credit = Number(inv.balance) < 0;
    return { inv, days: credit ? 0 : days, bucket: credit ? CREDIT : bucketOf(days) };
  });

  const totals = BUCKETS.map(b => ({
    ...b,
    sum: withBucket.filter(x => x.bucket.key === b.key).reduce((s, x) => s + Number(x.inv.balance), 0),
    count: withBucket.filter(x => x.bucket.key === b.key).length,
  }));
  const creditTotal = withBucket.filter(x => x.bucket.key === "credit").reduce((s, x) => s + Number(x.inv.balance), 0);
  const grandTotal = totals.reduce((s, t) => s + t.sum, 0) + creditTotal;
  const pastDueTotal = totals.filter(t => t.key !== "current").reduce((s, t) => s + t.sum, 0);

  const filtered = searchParams.bucket && !writeOffView
    ? withBucket.filter(x => x.bucket.key === searchParams.bucket)
    : withBucket;

  // ONE ROW PER CUSTOMER (owner request 2026-10-17: per-invoice rows read as
  // "duplicates"). Balances are summed, aging shows the worst invoice.
  type Group = {
    key: string; customerId: string | null; name: string; rep: string | null;
    locTag: string | null; locationId: string | null; days: number; bucket: (typeof withBucket)[number]["bucket"];
    balance: number; count: number;
  };
  const groups = new Map<string, Group & { pastDue: number; bucketSums: Record<string, number> }>();
  for (const x of filtered) {
    const key = x.inv.customer?.id ?? `raw:${x.inv.customerName.toLowerCase()}`;
    const bal = Number(x.inv.balance);
    let g = groups.get(key);
    if (!g) {
      g = {
        key, customerId: x.inv.customer?.id ?? null, name: x.inv.customerName,
        rep: x.inv.customer?.assignedRep?.name ?? null, locTag: x.inv.location?.shortTag ?? null, locationId: x.inv.locationId ?? null,
        days: 0, bucket: x.bucket, balance: 0, count: 0, pastDue: 0, bucketSums: {},
      };
      groups.set(key, g);
    }
    g.balance += bal;
    g.count++;
    g.bucketSums[x.bucket.key] = (g.bucketSums[x.bucket.key] ?? 0) + bal;
    if (x.days > 0 && bal > 0) g.pastDue += bal;
    if (x.days > g.days) g.days = x.days;
  }
  // The aging badge shows where the LARGEST past-due amount sits — a $1 残额
  // 101 days old must not paint a mostly-current customer as 91-120d overdue
  // (owner feedback 2026-10-19, WELD RITE case). Days still show the oldest.
  const OVERDUE_KEYS = ["b120plus", "b120", "b90", "b60", "b30"];
  for (const g of groups.values()) {
    const overdue = OVERDUE_KEYS.map(k => ({ k, sum: g.bucketSums[k] ?? 0 })).filter(x => x.sum > 0);
    const dominant = overdue.sort((a, b) => b.sum - a.sum)[0]?.k
      ?? (g.bucketSums.credit ? "credit" : "current");
    g.bucket = (dominant === "credit" ? { key: "credit", label: "Credit / prepaid", min: 0, max: 0 } : BUCKETS.find(b => b.key === dominant)) ?? g.bucket;
  }
  // Big real debts first: past-due amount, then age.
  const grouped = [...groups.values()].sort((a, b) => (b.pastDue - a.pastDue) || (b.days - a.days));
  // Totals above are computed from ALL invoices; the table renders a bounded page to keep the DOM light.
  const ROW_CAP = 300;
  const shown = grouped.slice(0, ROW_CAP);
  const canWriteOff = seesAll;
  const lastSync = await db.invoice.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, source: true } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{manager ? "A/R Aging" : "My A/R"} <span className="text-sm font-normal text-slate-400">({invoices.length} open invoices)</span></h1>
        <Link href="/ar/collections" className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">📞 Collections Workbench</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Net outstanding" value={fmtMoney(grandTotal)} />
        <StatCard label="Total past due" value={fmtMoney(pastDueTotal)} tone={pastDueTotal > 0 ? "danger" : "good"} />
        {totals.map(t => (
          <StatCard key={t.key} label={t.label} value={fmtMoney(t.sum)} hint={`${t.count} invoices`}
            tone={t.key === "current" ? "default" : t.key === "b30" ? "warn" : "danger"} />
        ))}
        {creditTotal !== 0 && <StatCard label="Customer credits" value={fmtMoney(creditTotal)} tone="good" />}
      </div>

      <form className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-5">
        <Input name="q" placeholder="Search customer name" defaultValue={searchParams.q} className="col-span-2" />
        <Select name="bucket" defaultValue={searchParams.bucket ?? ""}>
          <option value="">All buckets</option>
          {BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          <option value="credit">Credit / prepaid</option>
          {seesAll && <option value="writeoff">💀 Written off</option>}
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
        <THead cols={["Customer", "Rep", "Aging (main)", "Oldest (days)", "Invoices", "Past Due", "Balance", "Location", ...(canWriteOff ? [""] : [])]} />
        <tbody>
          {shown.map(g => (
            <tr key={g.key} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                {g.customerId
                  ? <Link href={`/customers/${g.customerId}`} className="text-brand-700 hover:underline">{g.name}</Link>
                  : g.name}
              </td>
              <td className="px-3 py-2 text-slate-600">{g.rep ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge className={g.bucket.key === "credit" || g.bucket.key === "current" ? "bg-emerald-100 text-emerald-700"
                  : g.bucket.key === "b30" ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"}>{g.bucket.label}</Badge>
              </td>
              <td className="px-3 py-2 tabular-nums">{g.days > 0 ? <span className="font-semibold text-red-600">{g.days}</span> : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-slate-500">{g.count}</td>
              <td className="px-3 py-2 tabular-nums">{g.pastDue > 0 ? <span className="font-semibold text-red-700">{fmtMoney(g.pastDue)}</span> : "—"}</td>
              <td className="px-3 py-2 font-semibold tabular-nums">{fmtMoney(g.balance)}</td>
              <td className="px-3 py-2">{g.locTag ?? "—"}</td>
              {canWriteOff && (
                <td className="px-3 py-2">
                  {(g.customerId || (g.locationId && !writeOffView)) && <WriteOffButton customerId={g.customerId} companyName={g.name} writtenOff={writeOffView} locationId={g.locationId} />}
                </td>
              )}
            </tr>
          ))}
          {grouped.length === 0 && <EmptyRow colSpan={canWriteOff ? 9 : 8} message={writeOffView ? "No written-off customers." : "No open invoices in this view."} />}
        </tbody>
      </Table>
      {grouped.length > shown.length && (
        <p className="text-xs text-slate-400">Showing the {shown.length} most overdue of {grouped.length} customers — filter by bucket or name to narrow down. (Totals above cover everything.)</p>
      )}
      <p className="text-xs text-slate-400">
        Aging is computed from each invoice&apos;s due date as of today.
        {lastSync && <> Last synced {lastSync.source === "TIREGURU_SYNC" ? "from TireGuru" : "by import"}: {lastSync.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET.</>}
      </p>
    </div>
  );
}
