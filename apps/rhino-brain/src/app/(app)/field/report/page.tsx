import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting, locationScope } from "@/lib/auth";
import { Badge, StatCard } from "@/components/ui/primitives";
import { FieldReportFilters } from "@/components/field-report-filters";

export const dynamic = "force-dynamic";

/** Day boundaries in US Eastern — reps work FL/TX; ET keeps "today" intuitive for the owner. */
function dayRangeET(dateStr?: string): { start: Date; end: Date; label: string } {
  const base = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null;
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const label = base ?? `${nowET.getFullYear()}-${String(nowET.getMonth() + 1).padStart(2, "0")}-${String(nowET.getDate()).padStart(2, "0")}`;
  // ET offset varies (EST/EDT); derive it from the target date itself
  const probe = new Date(`${label}T12:00:00Z`);
  const offsetMin = (probe.getTime() - new Date(probe.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime()) / 60000;
  const start = new Date(new Date(`${label}T00:00:00Z`).getTime() + offsetMin * 60000);
  return { start, end: new Date(start.getTime() + 86400000), label };
}

const shift = (label: string, days: number) => {
  const d = new Date(`${label}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const MAP_RE = /📍 On-site check-in: (https?:\/\/\S+)/;

export default async function FieldReportPage({ searchParams }: { searchParams: { date?: string; rep?: string } }) {
  const session = await requireSession();
  if (!isManager(session) && !isAccounting(session)) redirect("/field");
  const { start, end, label } = dayRangeET(searchParams.date);
  const repFilter = (searchParams.rep ?? "").trim().slice(0, 40);

  const [visits, prospects, reps] = await Promise.all([
    db.activity.findMany({
      where: {
        type: "VISIT", occurredAt: { gte: start, lt: end }, ...locationScope(session),
        ...(repFilter ? { repId: repFilter } : {}),
      },
      orderBy: { occurredAt: "asc" },
      include: {
        rep: { select: { id: true, name: true } },
        customer: { select: { id: true, companyName: true, city: true } },
      },
    }),
    db.customer.count({
      where: {
        source: "COLD_CALL", createdAt: { gte: start, lt: end }, ...locationScope(session),
        ...(repFilter ? { assignedRepId: repFilter } : {}),
      },
    }),
    db.user.findMany({
      where: { active: true, role: { in: ["SALES_REP", "MANAGER"] }, ...locationScope(session) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const byRep = new Map<string, typeof visits>();
  for (const v of visits) {
    const k = v.rep?.id ?? "unknown";
    (byRep.get(k) ?? byRep.set(k, []).get(k)!).push(v);
  }
  const withGps = visits.filter(v => MAP_RE.test(v.notes ?? "")).length;
  const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-400"><Link href="/field" className="hover:underline">Field Mode</Link> / Daily Report</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">🗺️ Field Daily Report <span className="text-sm font-normal text-slate-400">{label}</span></h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/field/report?date=${shift(label, -1)}${repFilter ? `&rep=${repFilter}` : ""}`} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">← Prev</Link>
          <Link href={`/field/report${repFilter ? `?rep=${repFilter}` : ""}`} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">Today</Link>
          <Link href={`/field/report?date=${shift(label, 1)}${repFilter ? `&rep=${repFilter}` : ""}`} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">Next →</Link>
          <FieldReportFilters date={label} rep={reps.some(r => r.id === repFilter) ? repFilter : ""} reps={reps} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Store visits" value={visits.length} />
        <StatCard label="With GPS check-in" value={withGps} tone={withGps < visits.length ? "warn" : "good"} hint={visits.length ? `${Math.round((withGps / visits.length) * 100)}%` : undefined} />
        <StatCard label="Reps in the field" value={byRep.size} />
        <StatCard label="New prospects created" value={prospects} tone="good" />
      </div>

      {visits.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
          No store visits logged on {label}.
        </div>
      )}

      {[...byRep.values()].sort((a, b) => b.length - a.length).map(repVisits => {
        const rep = repVisits[0].rep;
        return (
          <div key={rep?.id ?? "unknown"} className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <span className="font-semibold text-slate-800">{rep?.name ?? "Unknown rep"}</span>
              <span className="text-sm text-slate-500">{repVisits.length} visit{repVisits.length > 1 ? "s" : ""}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {repVisits.map(v => {
                const map = v.notes?.match(MAP_RE)?.[1];
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="w-16 shrink-0 tabular-nums text-slate-400">{fmtTime(v.occurredAt)}</span>
                    {v.customer ? (
                      <Link href={`/customers/${v.customer.id}`} className="font-medium text-brand-700 hover:underline">{v.customer.companyName}</Link>
                    ) : (
                      <span className="font-medium text-slate-600">(no customer linked)</span>
                    )}
                    {v.customer?.city && <span className="text-xs text-slate-400">{v.customer.city}</span>}
                    <span className="text-slate-500">{v.subject}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {v.outcome && <Badge className="bg-slate-100 text-slate-600">{v.outcome}</Badge>}
                      {map ? (
                        <a href={map} target="_blank" rel="noopener" className="text-xs font-medium text-emerald-700 underline">📍 map</a>
                      ) : (
                        <span className="text-xs text-slate-300">no check-in</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
