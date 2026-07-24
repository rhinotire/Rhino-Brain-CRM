import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealerOrderService } from "@rhino/services";
import { DealerBanner } from "@/components/dealer-banner";
import { ReorderButton } from "@/components/dealer-reorder";
import { getDealerSession } from "@/lib/dealer-session";

export const metadata: Metadata = {
  title: "My Orders — Dealer Portal",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  FULFILLED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-steel-100 text-steel-500",
};
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted — awaiting rep",
  CONFIRMED: "Confirmed",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

export default async function DealerOrdersPage({ searchParams }: { searchParams: { submitted?: string } }) {
  const session = await getDealerSession();
  if (!session) redirect("/dealer/login");

  const orders = await DealerOrderService.listForCustomer(session.customerId);

  return (
    <div className="pt-6">
      <DealerBanner session={session} active="/dealer/orders" />

      {searchParams.submitted && (
        <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Order {searchParams.submitted} submitted ✓ — your rep will confirm pricing and availability, usually the same
          business day.
        </div>
      )}

      <h1 className="mt-5 text-2xl font-black">My Orders</h1>

      {orders.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-steel-100 p-6 text-sm text-steel-500">
          No portal orders yet. Build one from the <Link href="/dealer/catalog" className="font-bold text-brand-dark">catalog</Link> —
          add quantities and submit.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => (
            <details key={o.requestNumber} className="rounded-2xl border border-steel-200 bg-white shadow-card" open={o.requestNumber === searchParams.submitted}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                <span className="font-display text-sm font-bold text-navy-900">{o.requestNumber}</span>
                <span className="text-xs text-steel-500">
                  {o.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                {o.poNumber && <span className="text-xs text-steel-500">PO {o.poNumber}</span>}
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[o.status]}`}>
                  {STATUS_LABEL[o.status]}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="font-display text-sm font-bold text-navy-900">${o.total.toFixed(2)}</span>
                  <ReorderButton
                    lines={o.items.map((i) => ({ sku: i.sku, label: i.description, size: i.sizeSpec, price: i.unitPrice, qty: i.quantity }))}
                  />
                </span>
              </summary>
              <div className="overflow-x-auto border-t border-steel-100 px-5 py-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-steel-400">
                      <th className="py-1 pr-3 font-semibold">SKU</th>
                      <th className="py-1 pr-3 font-semibold">Item</th>
                      <th className="py-1 pr-3 text-right font-semibold">Qty</th>
                      <th className="py-1 pr-3 text-right font-semibold">Unit</th>
                      <th className="py-1 text-right font-semibold">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.sku} className="border-t border-steel-100">
                        <td className="py-1.5 pr-3 font-mono">{i.sku}</td>
                        <td className="py-1.5 pr-3">
                          <span className="font-bold">{i.sizeSpec ?? ""}</span> {i.description}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{i.quantity}</td>
                        <td className="py-1.5 pr-3 text-right">${i.unitPrice.toFixed(2)}</td>
                        <td className="py-1.5 text-right font-bold">${i.lineTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-steel-400">
        Purchase history from before the portal will appear here once invoice history is synced. Questions about an
        order? Call your rep.
      </p>
    </div>
  );
}
