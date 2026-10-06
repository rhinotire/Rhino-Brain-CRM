import Link from "next/link";
import { db } from "@/lib/db";
import { requirePerm, locationScope } from "@/lib/auth";
import { fmtMoney } from "@/lib/domain";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import { VehicleButton } from "@/components/fleet-components";

export const dynamic = "force-dynamic";

/** Fleet overview: every truck, its open incidents and year-to-date upkeep cost. */
export default async function FleetPage() {
  const session = await requirePerm("ops");
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const vehicles = await db.vehicle.findMany({
    where: { ...locationScope(session) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      location: { select: { shortTag: true, color: true } },
      maintenances: { where: { date: { gte: yearStart } }, select: { cost: true } },
      incidents: { where: { status: { not: "RESOLVED" } }, select: { id: true } },
    },
  });

  const openIncidents = vehicles.reduce((s, v) => s + v.incidents.length, 0);
  const ytd = vehicles.reduce((s, v) => s + v.maintenances.reduce((x, m) => x + Number(m.cost ?? 0), 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🚚 Fleet</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Every vehicle&apos;s maintenance history, accidents and insurance claims. Insurance &amp; registration renewals live in <Link href="/ops" className="text-brand-600 underline">Operations</Link>.
          </p>
        </div>
        <VehicleButton />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Active vehicles" value={vehicles.filter(v => v.active).length} />
        <StatCard label="Open incidents / claims" value={openIncidents} tone={openIncidents ? "danger" : "good"} />
        <StatCard label="Upkeep cost this year" value={fmtMoney(ytd)} />
      </div>

      <Table>
        <THead cols={["Vehicle", "Plate", "Driver", "Odometer", "Upkeep YTD", "Open incidents", ""]} />
        <tbody className="divide-y divide-slate-100">
          {vehicles.length === 0 && <EmptyRow colSpan={7} message="No vehicles yet — add your trucks to start tracking maintenance and incidents." />}
          {vehicles.map(v => (
            <tr key={v.id} className={v.active ? "" : "opacity-50"}>
              <td className="px-3 py-2.5">
                <Link href={`/fleet/${v.id}`} className="font-medium text-brand-700 hover:underline">{v.name}</Link>
                {v.makeModel && <div className="text-xs text-slate-400">{v.makeModel}</div>}
              </td>
              <td className="px-3 py-2.5 text-sm text-slate-600">{v.plate ?? "—"}</td>
              <td className="px-3 py-2.5 text-sm text-slate-600">{v.assignedTo ?? "—"}</td>
              <td className="px-3 py-2.5 text-sm tabular-nums text-slate-600">{v.odometer ? v.odometer.toLocaleString() + " mi" : "—"}</td>
              <td className="px-3 py-2.5 text-sm tabular-nums text-slate-600">{fmtMoney(v.maintenances.reduce((s, m) => s + Number(m.cost ?? 0), 0))}</td>
              <td className="px-3 py-2.5">
                {v.incidents.length > 0
                  ? <Badge className="bg-red-100 text-red-700">{v.incidents.length} open</Badge>
                  : <Badge className="bg-emerald-100 text-emerald-700">clear</Badge>}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Link href={`/fleet/${v.id}`} className="text-xs text-brand-600 hover:underline">Open →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
