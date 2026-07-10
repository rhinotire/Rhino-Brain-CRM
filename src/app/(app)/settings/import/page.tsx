import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Table, THead, EmptyRow } from "@/components/ui/primitives";
import { CsvImporter } from "@/components/csv-importer";
import { ArImporter } from "@/components/ar-importer";
import { InventoryImporter } from "@/components/inventory-importer";
import { OrderImporter } from "@/components/order-importer";
import { CustomerMasterImporter } from "@/components/customer-master-importer";
import { fmtDateTime } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireManager();

  const [batches, locations] = await Promise.all([
    db.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
      take: 20,
    }),
    db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Import / Export</h1>

      <CustomerMasterImporter locations={locations} />

      <InventoryImporter locations={locations} />

      <OrderImporter />

      <ArImporter />

      <CsvImporter />

      <Card title="Export Data (CSV)">
        <div className="flex flex-wrap gap-2">
          {(["customers", "leads", "activities", "quotes"] as const).map(e => (
            <a key={e} href={`/api/export/${e}`}
              className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium capitalize text-slate-700 hover:bg-slate-50">
              ⬇ {e}.csv
            </a>
          ))}
        </div>
      </Card>

      <Card title="Tireguru POS Integration">
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          <p className="font-medium text-slate-600">Coming soon</p>
          <p className="mt-1">
            The customer model already includes <code className="rounded bg-slate-200 px-1">tireguruId</code> and{" "}
            <code className="rounded bg-slate-200 px-1">externalSource</code> fields. When Tireguru API access is available,
            order history and customer sync will plug in here without a schema change. In the meantime you can export
            customers from Tireguru as CSV and import them above.
          </p>
        </div>
      </Card>

      <Card title="Recent Imports">
        <Table>
          <THead cols={["File", "Type", "Imported", "Skipped", "By", "When"]} />
          <tbody>
            {batches.map(b => (
              <tr key={b.id} className="border-b border-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">{b.fileName}</td>
                <td className="px-3 py-2 capitalize text-slate-600">{b.entity.toLowerCase()}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-700">{b.successful}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500">{b.failed}</td>
                <td className="px-3 py-2 text-slate-600">{b.user.name}</td>
                <td className="px-3 py-2">{fmtDateTime(b.createdAt)}</td>
              </tr>
            ))}
            {batches.length === 0 && <EmptyRow colSpan={6} message="No imports yet." />}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
