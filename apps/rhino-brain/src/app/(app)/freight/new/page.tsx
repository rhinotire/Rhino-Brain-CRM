import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightNewForm } from "@/components/freight-new-form";

export const dynamic = "force-dynamic";

export default async function FreightNewPage() {
  await requireManager();
  const [consignees, carriers] = await Promise.all([
    db.freightConsignee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.freightCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { contacts: { where: { active: true } } } }),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">新询价</h1>
      <FreightNewForm
        consignees={consignees.map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
        carriers={carriers.map((c) => ({ id: c.id, name: c.name, contactCount: c.contacts.length }))}
      />
    </div>
  );
}
