import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope, adminLocFilter } from "@/lib/auth";
import { Badge } from "@/components/ui/primitives";
import { NewLeadButton, LeadCardActions } from "@/components/lead-components";
import { QuickLogButton } from "@/components/quick-log";
import {
  stageLabels, stageOrder, customerTypeLabels, customerSourceLabels, productLabels,
  lostReasonLabels, leadNeedsFirstContact, fmtDate, daysSince,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: { rep?: string } }) {
  const session = await requireSession();
  const adminLocations = session.role === "ADMIN"
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } })
    : [];
  const manager = isManager(session);
  const now = new Date();

  const where = { ...repScope(session, "assignedRepId"), ...locationScope(session) } as Record<string, unknown>;
  if (manager && searchParams.rep) where.assignedRepId = searchParams.rep;

  const [leads, reps] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { assignedRep: { select: { id: true, name: true } } },
      take: 500,
    }),
    db.user.findMany({ where: { active: true, role: { in: ["SALES_REP", "MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const visibleStages = stageOrder.filter(s => s !== "ACTIVE_CUSTOMER");
  const byStage = Object.fromEntries(visibleStages.map(s => [s, leads.filter(l => l.stage === s)]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Lead Pipeline <span className="text-sm font-normal text-slate-400">({leads.length} leads)</span></h1>
        <div className="flex items-center gap-2">
          {manager && (
            <form>
              <select name="rep" defaultValue={searchParams.rep ?? ""} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                // no client JS needed: submit on change via form
              >
                <option value="">All reps</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button type="submit" className="ml-2 h-9 rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">Filter</button>
            </form>
          )}
          <NewLeadButton reps={reps} canAssign={manager} locations={adminLocations} currentLocationId={adminLocations.length ? adminLocFilter() : null} />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleStages.map(stage => (
          <div key={stage} className="w-72 shrink-0 rounded-lg bg-slate-100 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{stageLabels[stage]}</span>
              <Badge className="bg-white text-slate-500">{byStage[stage].length}</Badge>
            </div>
            <div className="space-y-2">
              {byStage[stage].map(lead => {
                const stale = leadNeedsFirstContact(lead, now);
                const days = daysSince(lead.lastActivityAt ?? lead.createdAt, now);
                return (
                  <div key={lead.id} className={`rounded-md border bg-white p-3 shadow-sm ${stale ? "border-amber-400 ring-1 ring-amber-200" : "border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{lead.companyName}</div>
                        <div className="text-xs text-slate-500">{lead.contactPerson || "—"}{lead.city ? ` · ${lead.city}, ${lead.state ?? ""}` : ""}</div>
                      </div>
                      {stale && <Badge className="bg-amber-100 text-amber-800">Needs First Contact</Badge>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className="bg-slate-100 text-slate-600">{customerTypeLabels[lead.type]}</Badge>
                      <Badge className="bg-sky-50 text-sky-700">{productLabels[lead.interest]}</Badge>
                      <Badge className="bg-slate-50 text-slate-500">{customerSourceLabels[lead.source]}</Badge>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-400">
                      {lead.assignedRep ? lead.assignedRep.name : "Unassigned"} · added {fmtDate(lead.createdAt)}
                      {days !== null && ` · ${days}d since activity`}
                    </div>
                    {stage === "LOST" && lead.lostReason && (
                      <div className="mt-1 text-[11px] text-red-500">Reason: {lostReasonLabels[lead.lostReason]}{lead.lostNote ? ` — ${lead.lostNote}` : ""}</div>
                    )}
                    {stage !== "LOST" && (
                      <div className="mt-2">
                        <QuickLogButton leadId={lead.id} label="Log Call" variant="secondary" size="sm" />
                      </div>
                    )}
                    <LeadCardActions
                      leadId={lead.id} stage={lead.stage}
                      canAssign={manager} reps={reps} assignedRepId={lead.assignedRepId}
                    />
                  </div>
                );
              })}
              {byStage[stage].length === 0 && <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Empty</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
