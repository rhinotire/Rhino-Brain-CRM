import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightConsigneeManager } from "@/components/freight-consignee-manager";

export const dynamic = "force-dynamic";

export default async function FreightConsigneesPage() {
  await requireManager();
  const consignees = await db.freightConsignee.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Consignees</h1>
      <FreightConsigneeManager
        consignees={consignees.map((c) => ({
          id: c.id, name: c.name, addressLine: c.addressLine, city: c.city, state: c.state, zip: c.zip,
          contactName: c.contactName, phone: c.phone, deliveryNotes: c.deliveryNotes, active: c.active,
        }))}
      />
    </div>
  );
}
