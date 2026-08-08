import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Select, Button, StatCard } from "@/components/ui/primitives";
import { NewOpportunityButton, OpportunityActions } from "@/components/opportunity-form";
import { probabilityLabels, opportunityStatusLabels, productLabels, fmtMoney, fmtDate } from "@/lib/domain";
import Link from "next/link";
import type { Prisma, OpportunityStatus, Probability, ProductCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { status?: string; probability?: string; category?: string; rep?: string };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const manager = isManager(session);

  const where: Prisma.OpportunityWhereInput = { ...repScope(session, "repId"), ...locationScope(session) };
  where.status = (searchParams.status as OpportunityStatus) || "OPEN";
  if (searchParams.status === "ALL") delete where.status;
  if (searchParams.probability) where.probability = searchParams.probability as Probability;
  if (searchParams.category) where.category = searchParams.category as ProductCategory;
  if (manager && searchParams.rep) where.repId = searchParams.rep;

  const [opps, customers, reps] = await Promise.all([
    db.opportunity.findMany({
      where, orderBy: [{ probability: "desc" }, { updatedAt: "desc" }],
      include: { customer: { select: { id: true, companyName: true } }, rep: { select: { name: true } } },
      take: 300,
    }),
    db.customer.findMany({ where: { ...repScope(session), ...locationScope(session) }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" }, take: 500 }),
    manager ? db.user.findMany({ where: { active: true, ...locationScope(session) }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  const open = opps.filter(o => o.status === "OPEN");
  const highProb = open.filter(o => o.probability === "HIGH").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Product Opportunities</h1>
        <NewOpportunityButton customers={customers} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Open Opportunities" value={String(open.length)} />
        <StatCard label="High Probability" value={String(highProb)} tone={highProb > 0 ? "good" : "default"} />
        <StatCard label="Won (this view)" value={String(opps.filter(o => o.status === "WON").length)} />
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-36">
          <Select name="status" defaultValue={searchParams.status ?? "OPEN"}>
            <option value="OPEN">Open</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
            <option value="ALL">All</option>
          </Select>
        </div>
        <div className="w-44">
          <Select name="category" defaultValue={searchParams.category ?? ""}>
            <option value="">All categories</option>
            {Object.entries(productLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Select name="probability" defaultValue={searchParams.probability ?? ""}>
            <option value="">All probabilities</option>
            {Object.entries(probabilityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Table>
        <THead cols={["Customer", "Category", "Monthly Volume", "Current Supplier", "Target Price", "Probability", "Next Action", "Rep", "Status", "Actions"]} />
        <tbody>
          {opps.map(o => (
            <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2"><Link href={`/customers/${o.customer.id}`} className="font-medium text-brand-700 hover:underline">{o.customer.companyName}</Link></td>
              <td className="px-3 py-2"><Badge className="bg-sky-50 text-sky-700">{productLabels[o.category]}</Badge></td>
              <td className="px-3 py-2 text-slate-600">{o.estMonthlyVolume || "—"}</td>
              <td className="px-3 py-2 text-slate-600">{o.currentSupplier || "—"}{o.competitorBrand ? ` (${o.competitorBrand})` : ""}</td>
              <td className="px-3 py-2 tabular-nums">{o.targetPrice ? fmtMoney(Number(o.targetPrice)) : "—"}</td>
              <td className="px-3 py-2">
                <Badge className={o.probability === "HIGH" ? "bg-emerald-100 text-emerald-800" : o.probability === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>
                  {probabilityLabels[o.probability]}
                </Badge>
              </td>
              <td className="max-w-xs px-3 py-2 text-slate-600">{o.nextAction || "—"}<div className="text-[11px] text-slate-400">updated {fmtDate(o.updatedAt)}</div></td>
              <td className="px-3 py-2 text-slate-600">{o.rep.name}</td>
              <td className="px-3 py-2">
                <Badge className={o.status === "WON" ? "bg-emerald-100 text-emerald-800" : o.status === "LOST" ? "bg-red-100 text-red-700" : "bg-sky-50 text-sky-700"}>
                  {opportunityStatusLabels[o.status]}
                </Badge>
              </td>
              <td className="px-3 py-2"><OpportunityActions id={o.id} status={o.status} /></td>
            </tr>
          ))}
          {opps.length === 0 && <EmptyRow colSpan={10} message="No opportunities in this view. Track what each customer could buy from you here." />}
        </tbody>
      </Table>
    </div>
  );
}
