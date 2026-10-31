import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, seesAllLocations, locationScope, adminLocFilter } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { ClaimCustomerButton } from "@/components/claim-customer-button";
import { CustomersFilter } from "@/components/customers-filter";
import { customerTypeLabels, customerStatusLabels, fmtDate } from "@/lib/domain";
import { CustomerType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { buildCustomerFilterWhere, CUSTOMER_FILTER_STATES } from "@rhino/services";

export const dynamic = "force-dynamic";

const CUSTOMER_TYPES = Object.values(CustomerType);
const PAGE_SIZE = 200;
/** A sale inside this window is what makes a pool customer urgent: they are buying, nobody owns them. */
const BUYING_DAYS = 90;

type Search = { q?: string; type?: string; city?: string; state?: string };

/**
 * 公海客户 — every customer nobody owns, for this company only.
 *
 * The pool is the ABSENCE of a rep, not a stored flag, so this query IS the definition: no
 * assignedRepId, a real company location, and not a status nobody should be handed
 * (spec section 6.1). Ordered so the ones that cost money to ignore come first.
 */
export default async function CustomerPoolPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const allLoc = seesAllLocations(session);
  const showLocCol = allLoc && !adminLocFilter();
  const buyingSince = new Date(Date.now() - BUYING_DAYS * 86_400_000);

  const where: Prisma.CustomerWhereInput = {
    assignedRepId: null,
    locationId: { not: null }, // never claimable: no rep could own it without crossing companies
    status: { notIn: ["LOST", "DO_NOT_CONTACT"] },
    poolExempt: false,
    ...buildCustomerFilterWhere({
      scope: locationScope(session),
      allowedTypes: CUSTOMER_TYPES,
      type: searchParams.type,
      city: searchParams.city,
      state: searchParams.state,
    }),
  };
  const q = searchParams.q?.trim();
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { contactPerson: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }

  const [customers, total, buyingCount] = await Promise.all([
    db.customer.findMany({
      where,
      // Buying customers first, then never-contacted, then the longest-neglected.
      orderBy: [{ lastSaleAt: { sort: "desc", nulls: "last" } }, { lastContactAt: { sort: "asc", nulls: "first" } }],
      take: PAGE_SIZE,
      select: {
        id: true, companyName: true, city: true, state: true, type: true, status: true,
        contactPerson: true, phone: true, lastContactAt: true, lastSaleAt: true,
        location: { select: { shortTag: true, color: true } },
        poolEvents: {
          where: { kind: { in: ["RECYCLE", "MANUAL_UNASSIGN"] } },
          orderBy: { at: "desc" },
          take: 1,
          select: { at: true, reason: true, rep: { select: { name: true } } },
        },
      },
    }),
    db.customer.count({ where }),
    db.customer.count({ where: { ...where, lastSaleAt: { gte: buyingSince } } }),
  ]);

  const truncated = total > customers.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">
            公海客户 — Customer Pool{" "}
            <span className="text-sm font-normal text-slate-400">
              ({truncated ? `showing ${customers.length} of ${total.toLocaleString()}` : total.toLocaleString()})
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Customers nobody owns. Claim one and it is yours — but if it goes 90 days with no contact and no sale it
            returns here, so take what you will actually work.
          </p>
        </div>
        <Link href="/customers" className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          ← All customers
        </Link>
      </div>

      {buyingCount > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{buyingCount}</strong> {buyingCount === 1 ? "customer in this pool has" : "customers in this pool have"} bought
          from us in the last {BUYING_DAYS} days with no rep on the account. They are at the top of the list.
          <span className="mt-1 block text-xs text-amber-800">
            "Last invoice" is the invoice due date — the sale plus payment terms — so for a recent purchase it can be a
            future date. Counter sales reach the CRM through the A/R import, not as a logged call.
          </span>
        </div>
      )}

      <CustomersFilter
        statuses={[]}
        types={CUSTOMER_TYPES.map(t => [t, customerTypeLabels[t] ?? t] as [string, string])}
        states={CUSTOMER_FILTER_STATES.map(s => [s, s] as [string, string])}
        interests={[]}
        reps={[]}
      />

      <Table>
        {/* "Last invoice", not "Last sale": the date is Invoice.dueDate — the sale plus payment
            terms — so for a recent purchase it is legitimately in the future. Labelling it a sale
            date would read as a bug the first time someone saw next month against a customer. */}
        <THead cols={["Company", ...(showLocCol ? ["Location"] : []), "Contact", "Type", "Status", "Last invoice", "Last contact", "Previously held by", ""]} />
        <tbody>
          {customers.map(c => {
            const buying = c.lastSaleAt !== null && c.lastSaleAt >= buyingSince;
            const previous = c.poolEvents[0];
            return (
              <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 ${buying ? "bg-amber-50/60" : ""}`}>
                <td className="px-3 py-2">
                  <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link>
                  <div className="text-xs text-slate-400">{c.city}{c.city && c.state ? ", " : ""}{c.state}</div>
                </td>
                {showLocCol && (
                  <td className="px-3 py-2">
                    {c.location ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.location.color }} />
                        {c.location.shortTag}
                      </span>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-slate-600">
                  {c.contactPerson ?? "—"}
                  <div className="text-xs text-slate-400">{c.phone}</div>
                </td>
                <td className="px-3 py-2 text-slate-600">{customerTypeLabels[c.type] ?? c.type}</td>
                <td className="px-3 py-2">
                  <Badge className={c.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : c.status === "INACTIVE" ? "bg-slate-100 text-slate-600" : "bg-sky-100 text-sky-800"}>
                    {customerStatusLabels[c.status] ?? c.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {c.lastSaleAt ? (
                    <span className={buying ? "font-semibold text-amber-800" : ""}>{fmtDate(c.lastSaleAt)}</span>
                  ) : <span className="text-slate-300">—</span>}
                  {buying && <div className="text-xs font-medium text-amber-700">buying now</div>}
                </td>
                <td className="px-3 py-2">
                  {c.lastContactAt ? fmtDate(c.lastContactAt) : <span className="text-xs text-slate-400">never contacted</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {previous ? (
                    <>
                      {previous.rep?.name ?? "—"}
                      <div className="text-slate-400">{fmtDate(previous.at)}</div>
                    </>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <ClaimCustomerButton customerId={c.id} companyName={c.companyName} />
                </td>
              </tr>
            );
          })}
          {customers.length === 0 && (
            <EmptyRow colSpan={showLocCol ? 9 : 8} message="Nothing in the pool for your company right now — every customer has a rep." />
          )}
        </tbody>
      </Table>
    </div>
  );
}
