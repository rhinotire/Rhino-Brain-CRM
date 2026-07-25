import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { ExclusionManager } from "@/components/exclusion-manager";

export const dynamic = "force-dynamic";

/** Protection list (blacklist): companies collectors must never surface and
 * outreach must never touch — existing customers, agents, competitors,
 * opt-outs and manual rejects. */
export default async function ExclusionsPage({ searchParams }: { searchParams?: { q?: string } }) {
  const session = await requireManager();
  const q = (searchParams?.q ?? "").trim();

  const [total, byKind, rows] = await Promise.all([
    db.exclusionList.count(),
    db.exclusionList.groupBy({ by: ["kind"], _count: true }),
    db.exclusionList.findMany({
      where: q
        ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { domain: { contains: q.toLowerCase() } }] }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          Protection List <span className="text-sm font-normal text-slate-400">(blacklist — never contacted, never re-collected)</span>
        </h1>
        <div className="flex gap-3 text-sm text-slate-500">
          <span>Total <b>{total}</b></span>
          {byKind.map((k) => <span key={k.kind}>{k.kind} <b>{k._count}</b></span>)}
        </div>
      </div>

      <form className="flex gap-2" action="/prospecting/exclusions" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search company or domain…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Search</button>
        <a href="/prospecting" className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">← Back to Prospecting</a>
      </form>

      <ExclusionManager
        isAdmin={session.role === "ADMIN"}
        rows={rows.map((r) => ({
          id: r.id, kind: r.kind, companyName: r.companyName,
          domain: r.domain, phone: r.phone, reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
