import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightCarrierManager } from "@/components/freight-carrier-manager";

export const dynamic = "force-dynamic";

export default async function FreightCarriersPage() {
  await requireManager();
  const carriers = await db.freightCarrier.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { contacts: true },
  });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Carriers</h1>
      <FreightCarrierManager
        carriers={carriers.map((c) => ({
          id: c.id, name: c.name, phone: c.phone, mcNumber: c.mcNumber, notes: c.notes, active: c.active,
          equipmentTypes: c.equipmentTypes as ("DRY_VAN_53" | "FLATBED_53")[],
          contacts: c.contacts.map((ct) => ({ id: ct.id, name: ct.name, email: ct.email, active: ct.active })),
        }))}
      />
    </div>
  );
}
