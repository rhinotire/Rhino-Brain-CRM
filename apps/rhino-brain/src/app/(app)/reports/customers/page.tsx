import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Card, StatCard } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import {
  customerTemperature, temperatureLabels, temperatureClasses, tierLabels,
  fmtDate, daysSince, type Temperature,
} from "@/lib/domain";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CustomerReport() {
  const now = new Date();

  const session = await requireManager();
  const customers = await db.customer.findMany({
    where: { status: { in: ["ACTIVE", "PROSPECT"] }, ...locationScope(session) },
    include: { assignedRep: { select: { name: true } } },
    orderBy: { lastContactAt: "asc" },
    take: 1000,
  });

  const withTemp = customers.map(c => ({ ...c, temp: customerTemperature(c.lastContactAt, now) }));
  const counts = withTemp.reduce((m, c) => { m[c.temp] = (m[c.temp] ?? 0) + 1; return m; }, {} as Record<Temperature, number>);
  const attention = withTemp
    .filter(c => c.temp === "COOLING" || c.temp === "INACTIVE" || c.temp === "LOST" || c.temp === "NEVER")
    .sort((a, b) => (b.tier < a.tier ? 1 : b.tier > a.tier ? -1 : 0)); // A-tier first

  const tempOrder: Temperature[] = ["HOT", "WARM", "COOLING", "INACTIVE", "LOST", "NEVER"];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Customer Health Report</h1>

      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {tempOrder.map(t => (
          <StatCard key={t} label={temperatureLabels[t]} value={String(counts[t] ?? 0)}
            tone={t === "HOT" || t === "WARM" ? "good" : t === "COOLING" ? "warn" : "danger"} />
        ))}
      </div>

      <Card title={`Customer Attention List (${attention.length}) — sorted A-tier first`}>
        <Table>
          <THead cols={["Customer", "Tier", "Type", "Rep", "Last Contact", "Days Silent", "Temperature", "Action"]} />
          <tbody>
            {attention.map(c => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link></td>
                <td className="px-3 py-2"><Badge className={c.tier === "A" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600"}>Tier {tierLabels[c.tier]}</Badge></td>
                <td className="px-3 py-2 text-slate-600">{c.city ? `${c.city}, ${c.state ?? ""}` : "—"}</td>
                <td className="px-3 py-2 text-slate-600">{c.assignedRep?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
                <td className="px-3 py-2">{fmtDate(c.lastContactAt) || "Never"}</td>
                <td className="px-3 py-2 font-semibold text-red-600 tabular-nums">{daysSince(c.lastContactAt, now) ?? "∞"}</td>
                <td className="px-3 py-2"><Badge className={temperatureClasses[c.temp]}>{temperatureLabels[c.temp]}</Badge></td>
                <td className="px-3 py-2"><QuickLogButton customerId={c.id} label="Log Call" variant="secondary" size="sm" /></td>
              </tr>
            ))}
            {attention.length === 0 && <EmptyRow colSpan={8} message="No customers need attention — the whole book is warm." />}
          </tbody>
        </Table>
      </Card>

      <p className="text-xs text-slate-400">
        Temperature: Hot &lt;7d · Warm 7–30d · Cooling 30–60d · Inactive 60–90d · Lost &gt;90d since last contact.
      </p>
    </div>
  );
}
