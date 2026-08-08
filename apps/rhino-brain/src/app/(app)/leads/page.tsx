import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope, adminLocFilter } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Select, Input, Button } from "@/components/ui/primitives";
import { NewLeadButton } from "@/components/lead-components";
import {
  stageLabels, customerTypeLabels, customerSourceLabels, productLabels,
  leadNeedsFirstContact, fmtDate,
} from "@/lib/domain";
import type { Prisma, PipelineStage } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { q?: string; stage?: string; rep?: string; source?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const adminLocations = session.role === "ADMIN"
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } })
    : [];
  const manager = isManager(session);
  const now = new Date();

  const where: Prisma.LeadWhereInput = { ...repScope(session, "assignedRepId"), ...locationScope(session) };
  if (searchParams.q) {
    where.OR = [
      { companyName: { contains: searchParams.q, mode: "insensitive" } },
      { contactPerson: { contains: searchParams.q, mode: "insensitive" } },
      { phone: { contains: searchParams.q } },
      { email: { contains: searchParams.q, mode: "insensitive" } },
      { city: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }
  if (searchParams.stage) where.stage = searchParams.stage as PipelineStage;
  if (manager && searchParams.rep) where.assignedRepId = searchParams.rep;
  if (searchParams.source) where.source = searchParams.source as Prisma.LeadWhereInput["source"];

  const [leads, reps] = await Promise.all([
    db.lead.findMany({ where, orderBy: { createdAt: "desc" }, include: { assignedRep: { select: { name: true } } }, take: 300 }),
    db.user.findMany({ where: { active: true, role: { in: ["SALES_REP", "MANAGER"] }, ...locationScope(session) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Leads <span className="text-sm font-normal text-slate-400">({leads.length})</span></h1>
        <div className="flex gap-2">
          <a href="/api/export/leads" className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>
          <NewLeadButton reps={reps} canAssign={manager} locations={adminLocations} currentLocationId={adminLocations.length ? adminLocFilter() : null} />
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-64"><Input name="q" placeholder="Search name / phone / email / city…" defaultValue={searchParams.q} /></div>
        <div className="w-44">
          <Select name="stage" defaultValue={searchParams.stage ?? ""}>
            <option value="">All stages</option>
            {Object.entries(stageLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Select name="source" defaultValue={searchParams.source ?? ""}>
            <option value="">All sources</option>
            {Object.entries(customerSourceLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
        <THead cols={["Company", "Contact", "Type", "Interest", "Source", "Stage", "Rep", "Added", "Next F/U"]} />
        <tbody>
          {leads.map(l => (
            <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">
                  {l.companyName}
                  {(!l.phone || !l.email) && (
                    <span className="ml-1.5 align-middle text-red-500" title={`Missing ${[!l.phone && "phone", !l.email && "email"].filter(Boolean).join(" & ")}`}>⚠</span>
                  )}
                </div>
                {leadNeedsFirstContact(l, now) && <Badge className="mt-0.5 bg-amber-100 text-amber-800">Needs First Contact</Badge>}
              </td>
              <td className="px-3 py-2 text-slate-600">
                <div>{l.contactPerson || "—"}</div>
                <div className="text-xs text-slate-400">{l.phone || l.email || ""}</div>
              </td>
              <td className="px-3 py-2">{customerTypeLabels[l.type]}</td>
              <td className="px-3 py-2">{productLabels[l.interest]}</td>
              <td className="px-3 py-2">{customerSourceLabels[l.source]}</td>
              <td className="px-3 py-2">
                <Badge className={l.stage === "LOST" ? "bg-red-100 text-red-700" : l.stage === "ACTIVE_CUSTOMER" ? "bg-emerald-100 text-emerald-800" : "bg-sky-50 text-sky-700"}>
                  {stageLabels[l.stage]}
                </Badge>
              </td>
              <td className="px-3 py-2 text-slate-600">{l.assignedRep?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
              <td className="px-3 py-2">{fmtDate(l.createdAt)}</td>
              <td className="px-3 py-2">{fmtDate(l.nextFollowUpAt)}</td>
            </tr>
          ))}
          {leads.length === 0 && <EmptyRow colSpan={9} message="No leads found. Add one or import a CSV from Settings → Import." />}
        </tbody>
      </Table>
      <p className="text-xs text-slate-400">Tip: manage stages visually on the <a href="/pipeline" className="text-brand-700 underline">Pipeline board</a>.</p>
    </div>
  );
}
