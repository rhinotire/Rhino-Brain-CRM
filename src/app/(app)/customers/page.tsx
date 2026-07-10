import Link from "next/link";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope, adminLocFilter } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { NewCustomerButton } from "@/components/new-customer-button";
import { CustomersFilter } from "@/components/customers-filter";
import { isStorageConfigured } from "@/lib/storage";
import {
  customerTypeLabels, customerStatusLabels, productLabels, temperatureClasses, temperatureLabels,
  customerTemperature, fmtDate,
} from "@/lib/domain";
import type { Prisma, CustomerStatus, CustomerType, ProductCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = {
  q?: string; status?: string; type?: string; rep?: string; interest?: string;
  state?: string; lastContact?: string; followUp?: string;
};

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const showLocCol = session.role === "ADMIN" && !adminLocFilter();
  const adminLocations = session.role === "ADMIN"
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } })
    : [];
  const manager = isManager(session);
  const now = new Date();

  const where: Prisma.CustomerWhereInput = { ...repScope(session), ...locationScope(session) };
  const q = searchParams.q?.trim();
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { contactPerson: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  if (searchParams.status) where.status = searchParams.status as CustomerStatus;
  if (searchParams.type) where.type = searchParams.type as CustomerType;
  if (searchParams.interest) where.mainInterest = searchParams.interest as ProductCategory;
  if (searchParams.state) where.state = { equals: searchParams.state, mode: "insensitive" };
  if (manager && searchParams.rep) where.assignedRepId = searchParams.rep;
  if (searchParams.lastContact) {
    const days = Number(searchParams.lastContact);
    where.OR = [
      ...(where.OR ?? []),
    ];
    where.AND = [{ OR: [{ lastContactAt: { lt: subDays(now, days) } }, { lastContactAt: null }] }];
  }
  if (searchParams.followUp === "overdue") where.nextFollowUpAt = { lt: now };
  if (searchParams.followUp === "today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    where.nextFollowUpAt = { gte: start, lt: end };
  }

  const [customers, reps] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { assignedRep: { select: { name: true } }, tags: { include: { tag: true } }, location: { select: { shortTag: true, name: true, color: true } } },
    }),
    manager ? db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{manager ? "Customers" : "My Customers"} <span className="text-sm font-normal text-slate-400">({customers.length})</span></h1>
        <div className="flex gap-2">
          {manager && <a href="/api/export/customers" className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>}
          <NewCustomerButton reps={reps} canAssign={manager} locations={adminLocations} currentLocationId={adminLocations.length ? adminLocFilter() : null} storageReady={isStorageConfigured()} />
        </div>
      </div>

      {/* Filters */}
      <CustomersFilter
        statuses={Object.entries(customerStatusLabels)}
        types={Object.entries(customerTypeLabels)}
        interests={Object.entries(productLabels)}
        reps={manager ? reps : []}
      />

      <Table>
        <THead cols={["Company", ...(showLocCol ? ["Location"] : []), "Contact", "Type", "Status", "Tier", "Temperature", "Rep", "Last Contact", "Next F/U"]} />
        <tbody>
          {customers.map(c => {
            const t = customerTemperature(c.lastContactAt, now);
            return (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
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
                <td className="px-3 py-2 text-slate-600">{customerTypeLabels[c.type]}</td>
                <td className="px-3 py-2"><Badge className={
                  c.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" :
                  c.status === "LEAD" || c.status === "PROSPECT" ? "bg-sky-100 text-sky-800" :
                  c.status === "LOST" || c.status === "DO_NOT_CONTACT" ? "bg-red-100 text-red-700" :
                  "bg-slate-100 text-slate-600"
                }>{customerStatusLabels[c.status]}</Badge></td>
                <td className="px-3 py-2 font-medium">{c.tier}</td>
                <td className="px-3 py-2"><Badge className={temperatureClasses[t]}>{temperatureLabels[t]}</Badge></td>
                <td className="px-3 py-2 text-slate-600">{c.assignedRep?.name ?? "—"}</td>
                <td className="px-3 py-2">{fmtDate(c.lastContactAt)}</td>
                <td className="px-3 py-2">{fmtDate(c.nextFollowUpAt)}</td>
              </tr>
            );
          })}
          {customers.length === 0 && <EmptyRow colSpan={9} message="No customers match these filters. Add your first customer with the button above." />}
        </tbody>
      </Table>
    </div>
  );
}
