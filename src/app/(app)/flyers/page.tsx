import { requireManager } from "@/lib/auth";
import { FlyerBuilder } from "@/components/flyer-builder";

export const dynamic = "force-dynamic";

export default async function FlyersPage() {
  await requireManager();
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-xl font-bold">📣 Monthly Special Flyer</h1>
        <p className="text-sm text-slate-500">
          Pick the products on special, set the prices, and AI writes the copy — then print or save as PDF to email/WhatsApp to your customers.
        </p>
      </div>
      <FlyerBuilder />
    </div>
  );
}
