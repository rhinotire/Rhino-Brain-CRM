import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePerm, locationScope } from "@/lib/auth";
import { chatImageUrl } from "@/lib/storage";
import { fmtDate, fmtMoney } from "@/lib/domain";
import { Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { VehicleButton, MaintenanceButton, IncidentButton, ClaimButton, MAINT_TYPES, type VehicleDTO, type IncidentDTO } from "@/components/fleet-components";

export const dynamic = "force-dynamic";

const CLAIM_BADGE: Record<string, string> = {
  FILED: "bg-sky-100 text-sky-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  PAID: "bg-emerald-600 text-white",
  DENIED: "bg-red-100 text-red-700",
};

export default async function VehiclePage({ params }: { params: { id: string } }) {
  const session = await requirePerm("ops");
  const vehicle = await db.vehicle.findUnique({
    where: { id: params.id },
    include: {
      location: { select: { shortTag: true, name: true } },
      maintenances: { orderBy: { date: "desc" }, take: 60 },
      incidents: { orderBy: { date: "desc" } },
    },
  });
  if (!vehicle) notFound();
  const guard = locationScope(session);
  if (guard.locationId && vehicle.locationId !== guard.locationId) notFound();

  const dto: VehicleDTO = {
    id: vehicle.id, name: vehicle.name, plate: vehicle.plate, vin: vehicle.vin,
    makeModel: vehicle.makeModel, assignedTo: vehicle.assignedTo,
    odometer: vehicle.odometer, active: vehicle.active, notes: vehicle.notes,
  };
  const totalUpkeep = vehicle.maintenances.reduce((s, m) => s + Number(m.cost ?? 0), 0);

  return (
    <div className="space-y-5">
      <nav className="text-xs text-slate-400"><Link href="/fleet" className="hover:underline">Fleet</Link> / {vehicle.name}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🚚 {vehicle.name} {!vehicle.active && <Badge className="bg-slate-200 text-slate-500">retired</Badge>}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {vehicle.makeModel && <span>{vehicle.makeModel}</span>}
            {vehicle.plate && <span>Plate {vehicle.plate}</span>}
            {vehicle.vin && <span className="text-xs">VIN {vehicle.vin}</span>}
            {vehicle.assignedTo && <span>Driver: {vehicle.assignedTo}</span>}
            {vehicle.odometer && <span>{vehicle.odometer.toLocaleString()} mi</span>}
            <span>Upkeep total: {fmtMoney(totalUpkeep)}</span>
          </div>
          {vehicle.notes && <p className="mt-1 text-xs text-slate-400">{vehicle.notes}</p>}
        </div>
        <div className="flex gap-2">
          <IncidentButton vehicleId={vehicle.id} />
          <MaintenanceButton vehicleId={vehicle.id} />
          <VehicleButton vehicle={dto} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Incidents & Insurance Claims</h2>
        <Table>
          <THead cols={["Date", "What happened", "Driver", "Claim", "Status", ""]} />
          <tbody className="divide-y divide-slate-100">
            {vehicle.incidents.length === 0 && <EmptyRow colSpan={6} message="No incidents on record. 🙏" />}
            {vehicle.incidents.map(i => {
              const idto: IncidentDTO = {
                id: i.id, status: i.status, claimNumber: i.claimNumber, insurer: i.insurer,
                claimAmount: i.claimAmount ? String(i.claimAmount) : null, claimStatus: i.claimStatus, notes: i.notes,
              };
              return (
                <tr key={i.id} className={i.status !== "RESOLVED" ? "bg-red-50/50" : "opacity-70"}>
                  <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(i.date)}</td>
                  <td className="px-3 py-2.5">
                    <div className="max-w-md text-sm text-slate-800">{i.description}</div>
                    <div className="mt-0.5 flex gap-3 text-xs text-slate-400">
                      {i.policeReport && <span>Police #{i.policeReport}</span>}
                      {i.photoPath && chatImageUrl(i.photoPath) && (
                        <a href={chatImageUrl(i.photoPath)!} target="_blank" rel="noopener" className="text-brand-600 underline">📷 photo</a>
                      )}
                      {i.notes && <span className="truncate">{i.notes}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-600">{i.driver ?? "—"}</td>
                  <td className="px-3 py-2.5 text-sm text-slate-600">
                    {i.claimNumber ? (
                      <>
                        <div>#{i.claimNumber}{i.insurer ? ` · ${i.insurer}` : ""}</div>
                        {i.claimAmount && <div className="text-xs tabular-nums">{fmtMoney(Number(i.claimAmount))}</div>}
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <Badge className={i.status === "RESOLVED" ? "bg-emerald-100 text-emerald-700" : i.status === "CLAIM_FILED" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-800"}>
                        {i.status.replace("_", " ")}
                      </Badge>
                      {i.claimStatus && <Badge className={CLAIM_BADGE[i.claimStatus] ?? "bg-slate-100 text-slate-600"}>claim {i.claimStatus}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><ClaimButton incident={idto} /></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Maintenance History</h2>
        <Table>
          <THead cols={["Date", "Type", "Odometer", "Cost", "Shop", "Notes"]} />
          <tbody className="divide-y divide-slate-100">
            {vehicle.maintenances.length === 0 && <EmptyRow colSpan={6} message="No maintenance logged yet — add oil changes and repairs as they happen." />}
            {vehicle.maintenances.map(m => (
              <tr key={m.id}>
                <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(m.date)}</td>
                <td className="px-3 py-2.5 text-sm text-slate-700">{MAINT_TYPES[m.type] ?? m.type}</td>
                <td className="px-3 py-2.5 text-sm tabular-nums text-slate-500">{m.odometer ? m.odometer.toLocaleString() : "—"}</td>
                <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">{m.cost ? fmtMoney(Number(m.cost)) : "—"}</td>
                <td className="px-3 py-2.5 text-sm text-slate-500">{m.vendor ?? "—"}</td>
                <td className="px-3 py-2.5 max-w-xs truncate text-xs text-slate-400">{m.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
