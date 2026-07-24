import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, repScope, locationScope } from "@/lib/auth";
import { StatCard, Badge } from "@/components/ui/primitives";
import { PortalOrderStatusSelect } from "@/components/portal-order-status";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  FULFILLED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-500",
};

type Search = { status?: string };

/** Orders placed by dealers in the website portal. Confirming = keyed into TireGuru. */
export default async function PortalOrdersPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const customerScope = { ...repScope(session), ...locationScope(session) };

  const where: Prisma.DealerOrderRequestWhereInput = { customer: customerScope };
  if (searchParams.status && searchParams.status !== "all") {
    where.status = searchParams.status as Prisma.DealerOrderRequestWhereInput["status"];
  }

  const [orders, openCount, weekCount] = await Promise.all([
    db.dealerOrderRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { id: true, companyName: true, assignedRep: { select: { name: true } } } },
        dealerUser: { select: { name: true, email: true } },
        items: { include: { product: { select: { sizeSpec: true } } } },
      },
    }),
    db.dealerOrderRequest.count({ where: { customer: customerScope, status: "SUBMITTED" } }),
    db.dealerOrderRequest.count({ where: { customer: customerScope, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
  ]);

  const FILTERS: [string, string][] = [["all", "All"], ["SUBMITTED", "Submitted"], ["CONFIRMED", "Confirmed"], ["FULFILLED", "Fulfilled"], ["CANCELLED", "Cancelled"]];
  const current = searchParams.status ?? "SUBMITTED";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        Portal Orders <span className="text-sm font-normal text-slate-400">(placed by dealers on the website)</span>
      </h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Awaiting confirmation" value={openCount} tone={openCount > 0 ? "warn" : "default"} />
        <StatCard label="New this week" value={weekCount} />
      </div>

      <div className="flex gap-2 text-sm">
        {FILTERS.map(([v, l]) => (
          <Link key={v} href={`/portal-orders?status=${v}`}
            className={`rounded-full px-3 py-1 font-semibold ${current === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>
            {l}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">No portal orders{current !== "all" ? " in this status" : ""} yet.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <details key={o.id} className="rounded-xl border border-slate-200 bg-white" open={o.status === "SUBMITTED"}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-mono text-sm font-bold">{o.requestNumber}</span>
                <span className="text-xs text-slate-500">
                  {o.createdAt.toLocaleDateString()} {o.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <Link href={`/customers/${o.customer.id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                  {o.customer.companyName}
                </Link>
                {o.poNumber && <Badge className="bg-slate-100 text-slate-600">PO {o.poNumber}</Badge>}
                <Badge className={STATUS_BADGE[o.status]}>{o.status}</Badge>
                <span className="text-xs text-slate-400">rep: {o.customer.assignedRep?.name ?? "—"}</span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="font-bold">${Number(o.total).toFixed(2)}</span>
                  <PortalOrderStatusSelect id={o.id} status={o.status} />
                </span>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="py-1 pr-3 font-semibold">SKU</th>
                      <th className="py-1 pr-3 font-semibold">Item</th>
                      <th className="py-1 pr-3 text-right font-semibold">Qty</th>
                      <th className="py-1 pr-3 text-right font-semibold">Unit</th>
                      <th className="py-1 text-right font-semibold">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id} className="border-t border-slate-50">
                        <td className="py-1.5 pr-3 font-mono">{i.sku}</td>
                        <td className="py-1.5 pr-3"><span className="font-semibold">{i.product?.sizeSpec ?? ""}</span> {i.description}</td>
                        <td className="py-1.5 pr-3 text-right">{i.quantity}</td>
                        <td className="py-1.5 pr-3 text-right">${Number(i.unitPrice).toFixed(2)}</td>
                        <td className="py-1.5 text-right font-semibold">${Number(i.lineTotal).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-500">
                  Placed by {o.dealerUser.name} ({o.dealerUser.email}){o.notes ? <> · Notes: <span className="font-semibold">{o.notes}</span></> : null}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Workflow: confirm price/stock with the customer if needed → key into TireGuru → set Confirmed. Portal
                  totals are indicative dealer pricing; TireGuru stays the invoice of record.
                </p>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
