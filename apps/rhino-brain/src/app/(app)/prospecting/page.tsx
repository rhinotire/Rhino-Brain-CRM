import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";
import { listRepsForAssign } from "@/actions/prospecting";
import { ProspectCard } from "@/components/prospect-card";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Prospect calibration queue (spec §6.2). AI-graded leads wait here for a
 * human verdict before any outreach can ever target them. */
export default async function ProspectingPage() {
  const session = await requireManager();
  const scope = locationScope(session);

  const [pendingCount, followedCount, rejectedCount, poolCounts, pending, reps, runs] = await Promise.all([
    db.lead.count({ where: { source: "PROSPECTING", reviewedAt: null, ...scope } }),
    db.lead.count({ where: { source: "PROSPECTING", reviewedAt: { not: null }, pool: { not: "D_EXCLUDED" }, ...scope } }),
    db.lead.count({ where: { source: "PROSPECTING", pool: "D_EXCLUDED", ...scope } }),
    db.lead.groupBy({ by: ["pool"], where: { source: "PROSPECTING", ...scope }, _count: true }),
    db.lead.findMany({
      where: { source: "PROSPECTING", reviewedAt: null, ...scope },
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      take: PAGE_SIZE,
    }),
    listRepsForAssign(),
    db.sourceRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          Prospecting <span className="text-sm font-normal text-slate-400">(AI-graded leads awaiting calibration)</span>
        </h1>
        <div className="flex gap-3 text-sm text-slate-500">
          <span>Pending <b>{pendingCount}</b></span>
          <span>Followed <b className="text-emerald-700">{followedCount}</b></span>
          <span>Rejected <b className="text-red-600">{rejectedCount}</b></span>
          {poolCounts.map((p) => <span key={p.pool ?? "null"}>{p.pool ?? "unscored"} <b>{p._count}</b></span>)}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        Recent runs:{" "}
        {runs.map((r) => (
          <span key={r.id} className="mr-3">
            {r.source} +{r.newLeadCount} new / {r.dupCount} dup / {r.excludedCount} protected · ${r.apiCostUsd.toFixed(2)} + {r.inputTokens + r.outputTokens} tok
          </span>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {pending.map((lead) => (
          <ProspectCard
            key={lead.id}
            reps={reps}
            lead={{
              id: lead.id, companyName: lead.companyName, city: lead.city, state: lead.state,
              pool: lead.pool, confidence: lead.confidence, productLine: lead.productLine, score: lead.score,
              email: lead.email, phone: lead.phone,
              scoreReasons: (lead.scoreReasons as never) ?? null,
              enrichment: (lead.enrichment as never) ?? null,
              meta: (lead.meta as never) ?? null,
            }}
          />
        ))}
        {pending.length === 0 && <p className="text-sm text-slate-400">Queue is empty — run the collector script to bring in more prospects.</p>}
      </div>
    </div>
  );
}
