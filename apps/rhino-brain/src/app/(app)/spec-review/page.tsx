import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { SpecProposalCard } from "@/components/spec-proposal-card";
import { SpecCsvImporter } from "@/components/spec-csv-importer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Tire spec review queue (enrichment layer 3). Rule-derived facts are written
 * directly; everything here came from the AI layer and needs a human yes/no
 * before it can ever reach the public website.
 */
export default async function SpecReviewPage() {
  await requireManager();

  const [pendingCount, approvedCount, rejectedCount, pending] = await Promise.all([
    db.specProposal.count({ where: { status: "PENDING" } }),
    db.specProposal.count({ where: { status: "APPROVED" } }),
    db.specProposal.count({ where: { status: "REJECTED" } }),
    db.specProposal.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: PAGE_SIZE,
      include: { product: { select: { sku: true, brand: true, sizeSpec: true, description: true, category: true, tireSpec: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          Spec Review <span className="text-sm font-normal text-slate-400">(AI proposals for tire specs)</span>
        </h1>
        <a href="/spec-review/export" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          ⇩ Export gap sheet (CSV)
        </a>
      </div>

      <p className="text-sm text-slate-500">
        Green = stated in the product text. Yellow = known fact about that tire line. Orange = educated guess (unchecked by default).
        Edit any value before approving; only checked fields are written. Nothing shows on the website until approved here.
      </p>

      <div className="flex gap-4 text-sm">
        <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">{pendingCount} pending</span>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{approvedCount} approved</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">{rejectedCount} rejected</span>
      </div>

      <SpecCsvImporter />

      <div className="space-y-3">
        {pending.map((p) => {
          const spec = (p.product.tireSpec ?? {}) as Record<string, unknown>;
          return (
            <SpecProposalCard
              key={p.id}
              proposalId={p.id}
              sku={p.product.sku}
              brand={p.product.brand}
              sizeSpec={p.product.sizeSpec}
              description={p.product.description}
              category={p.product.category}
              fields={p.fieldsJson as Record<string, { value: string | number; confidence: "high" | "medium" | "low" }>}
              current={Object.fromEntries(
                ["loadRange", "plyRating", "position", "treadType", "construction", "loadIndex", "speedRating", "application", "mileageWarrantyMiles"]
                  .map((f) => [f, (spec[f] ?? null) as string | number | null])
              )}
            />
          );
        })}
        {pending.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Review queue is empty — run the AI proposal batch to refill it.
          </div>
        )}
      </div>
      {pendingCount > PAGE_SIZE && (
        <p className="text-center text-sm text-slate-400">Showing first {PAGE_SIZE} — approve or reject these and the next batch loads on refresh.</p>
      )}
    </div>
  );
}
