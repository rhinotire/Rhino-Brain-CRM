import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireManager, locationScope , hasPerm } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Card, StatCard } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import { CustomerHealthFilter } from "@/components/customer-health-filter";
import {
  customerTemperature, temperatureLabels, temperatureClasses, tierLabels,
  fmtDate, daysSince, type Temperature,
} from "@/lib/domain";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Search = { temp?: string; tier?: string; rep?: string; q?: string };

const TEMPS: Temperature[] = ["HOT", "WARM", "COOLING", "INACTIVE", "LOST", "NEVER"];
const ATTENTION: Temperature[] = ["COOLING", "INACTIVE", "LOST", "NEVER"];
const isTemp = (v: string | undefined): v is Temperature => !!v && (TEMPS as string[]).includes(v);

// Build a report URL that keeps the other filters but swaps the temperature (tile clicks).
function tileHref(sp: Search, temp: string) {
  const params = new URLSearchParams();
  if (temp) params.set("temp", temp);
  if (sp.tier) params.set("tier", sp.tier);
  if (sp.rep) params.set("rep", sp.rep);
  if (sp.q) params.set("q", sp.q);
  const qs = params.toString();
  return `/reports/customers${qs ? `?${qs}` : ""}`;
}

export default async function CustomerReport({ searchParams }: { searchParams: Search }) {
  const now = new Date();

  const session = await requireManager();
  if (!hasPerm(session, "reports")) redirect("/my-work");
  const [customers, reps] = await Promise.all([
    db.customer.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] }, ...locationScope(session) },
      include: { assignedRep: { select: { name: true } } },
      orderBy: { lastContactAt: "asc" },
      take: 1000,
    }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const withTemp = customers.map(c => ({ ...c, temp: customerTemperature(c.lastContactAt, now) }));
  // Tile counts always reflect the whole book (not the current filter) so the six numbers stay comparable.
  const counts = withTemp.reduce((m, c) => { m[c.temp] = (m[c.temp] ?? 0) + 1; return m; }, {} as Record<Temperature, number>);

  // Filters: temperature (tile click or dropdown; default = needs attention), tier, rep, search.
  const temp = searchParams.temp ?? "";
  const tempSet: Temperature[] = isTemp(temp) ? [temp] : temp === "ALL" ? TEMPS : ATTENTION;
  const q = searchParams.q?.trim().toLowerCase();
  const list = withTemp
    .filter(c => tempSet.includes(c.temp))
    .filter(c => !searchParams.tier || c.tier === searchParams.tier)
    .filter(c => !searchParams.rep || (searchParams.rep === "unassigned" ? !c.assignedRepId : c.assignedRepId === searchParams.rep))
    .filter(c => !q || c.companyName.toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q))
    // A-tier first, then the longest-silent first (never contacted counts as longest)
    .sort((a, b) => (a.tier < b.tier ? -1 : a.tier > b.tier ? 1 : 0) || (daysSince(b.lastContactAt, now) ?? Infinity) - (daysSince(a.lastContactAt, now) ?? Infinity));

  const title = isTemp(temp) ? temperatureLabels[temp] : temp === "ALL" ? "All customers" : "Customer Attention List";
  const subtitle = [searchParams.tier ? `Tier ${searchParams.tier}` : "", searchParams.rep ? (searchParams.rep === "unassigned" ? "Unassigned" : reps.find(r => r.id === searchParams.rep)?.name ?? "") : "", searchParams.q ? `“${searchParams.q}”` : ""].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Customer Health Report</h1>

      {/* Tiles are links: click one to see exactly those customers; click again (or Clear) to go back to the attention list. */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {TEMPS.map(t => {
          const active = temp === t;
          return (
            <Link key={t} href={tileHref(searchParams, active ? "" : t)} title={active ? "Showing this group — click to go back" : `Show ${temperatureLabels[t]} customers`}
              className={`block rounded-lg transition-shadow hover:shadow-md ${active ? "ring-2 ring-brand-600" : ""}`}>
              <StatCard label={temperatureLabels[t]} value={String(counts[t] ?? 0)}
                tone={t === "HOT" || t === "WARM" ? "good" : t === "COOLING" ? "warn" : "danger"} />
            </Link>
          );
        })}
      </div>

      <CustomerHealthFilter
        temps={TEMPS.map(t => [t, temperatureLabels[t]])}
        tiers={Object.entries(tierLabels)}
        reps={reps}
      />

      <Card title={`${title} (${list.length})${subtitle ? ` — ${subtitle}` : ""} — A-tier first, longest silent first`}>
        <Table>
          <THead cols={["Customer", "Tier", "Type", "Rep", "Last Contact", "Days Silent", "Temperature", "Action"]} />
          <tbody>
            {list.map(c => {
              const silent = daysSince(c.lastContactAt, now);
              const hot = c.temp === "HOT" || c.temp === "WARM";
              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3 py-2"><Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link></td>
                  <td className="px-3 py-2"><Badge className={c.tier === "A" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600"}>Tier {tierLabels[c.tier]}</Badge></td>
                  <td className="px-3 py-2 text-slate-600">{c.city ? `${c.city}, ${c.state ?? ""}` : "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{c.assignedRep?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
                  <td className="px-3 py-2">{fmtDate(c.lastContactAt) || "Never"}</td>
                  <td className={`px-3 py-2 font-semibold tabular-nums ${hot ? "text-emerald-700" : "text-red-600"}`}>{silent ?? "∞"}</td>
                  <td className="px-3 py-2"><Badge className={temperatureClasses[c.temp]}>{temperatureLabels[c.temp]}</Badge></td>
                  <td className="px-3 py-2"><QuickLogButton customerId={c.id} label="Log Call" variant="secondary" size="sm" /></td>
                </tr>
              );
            })}
            {list.length === 0 && <EmptyRow colSpan={8} message={temp || subtitle ? "No customers match these filters." : "No customers need attention — the whole book is warm."} />}
          </tbody>
        </Table>
      </Card>

      <p className="text-xs text-slate-400">
        Temperature: Hot &lt;7d · Warm 7–30d · Cooling 30–60d · Inactive 60–90d · Lost &gt;90d since last contact. Click a tile to filter; the tile numbers always show the whole book.
      </p>
    </div>
  );
}
