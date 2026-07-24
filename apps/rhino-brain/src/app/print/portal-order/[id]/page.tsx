import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { AutoPrint } from "@/components/auto-print";

/**
 * Printable order sheet for a portal order request — pick ticket / TireGuru
 * entry sheet. Lives outside the (app) layout group so no sidebar/chrome prints.
 */
export default async function PortalOrderPrintPage({ params, searchParams }: { params: { id: string }; searchParams?: { auto?: string } }) {
  await requireSession();
  const o = await db.dealerOrderRequest.findUnique({
    where: { id: params.id },
    include: {
      customer: {
        select: {
          companyName: true, contactPerson: true, phone: true, email: true,
          address: true, city: true, state: true, zip: true,
          location: { select: { name: true, city: true } },
          assignedRep: { select: { name: true } },
        },
      },
      dealerUser: { select: { name: true, email: true } },
      items: { include: { product: { select: { sizeSpec: true } } } },
    },
  });
  if (!o) notFound();

  const units = o.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div id="print-area" className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:p-0">
      <AutoPrint auto={searchParams?.auto === "1"} />

      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div>
          <div className="text-2xl font-black uppercase">{o.customer.location?.name ?? "Rhino Tire USA"}</div>
          <div className="text-xs text-slate-500">{o.customer.location?.city}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-black">ORDER REQUEST</div>
          <div className="font-mono text-lg font-bold">{o.requestNumber}</div>
          <div className="text-xs text-slate-500">
            {o.createdAt.toLocaleDateString()} {o.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer</div>
          <div className="mt-1 font-bold">{o.customer.companyName}</div>
          {o.customer.address && <div>{o.customer.address}</div>}
          {(o.customer.city || o.customer.state) && (
            <div>{[o.customer.city, o.customer.state, o.customer.zip].filter(Boolean).join(", ")}</div>
          )}
          {o.customer.phone && <div>{o.customer.phone}</div>}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Order Info</div>
          <table className="mt-1 text-sm">
            <tbody>
              {o.poNumber && (
                <tr><td className="pr-3 font-semibold text-slate-500">Customer PO</td><td className="font-bold">{o.poNumber}</td></tr>
              )}
              <tr><td className="pr-3 font-semibold text-slate-500">Status</td><td>{o.status}</td></tr>
              <tr><td className="pr-3 font-semibold text-slate-500">Placed by</td><td>{o.dealerUser.name}</td></tr>
              <tr><td className="pr-3 font-semibold text-slate-500">Rep</td><td>{o.customer.assignedRep?.name ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left text-xs uppercase tracking-wide">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">SKU</th>
            <th className="py-2 pr-3">Description</th>
            <th className="py-2 pr-3 text-right">Qty</th>
            <th className="py-2 pr-3 text-right">Unit</th>
            <th className="py-2 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i, idx) => (
            <tr key={i.id} className="border-b border-slate-200">
              <td className="py-2 pr-3 text-slate-400">{idx + 1}</td>
              <td className="py-2 pr-3 font-mono">{i.sku}</td>
              <td className="py-2 pr-3">
                <span className="font-bold">{i.product?.sizeSpec ?? ""}</span> {i.description}
              </td>
              <td className="py-2 pr-3 text-right font-bold">{i.quantity}</td>
              <td className="py-2 pr-3 text-right">${Number(i.unitPrice).toFixed(2)}</td>
              <td className="py-2 text-right font-bold">${Number(i.lineTotal).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-3 text-xs text-slate-500">{o.items.length} lines · {units} units</td>
            <td colSpan={2} className="py-3 text-right text-xs font-bold uppercase tracking-wide">Order Total</td>
            <td className="py-3 text-right text-lg font-black">${Number(o.total).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {o.notes && (
        <div className="mt-4 rounded border border-slate-300 p-3 text-sm">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer notes</span>
          <div className="mt-0.5">{o.notes}</div>
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-slate-500">
        <div className="border-t border-slate-400 pt-1">Picked / packed by · date</div>
        <div className="border-t border-slate-400 pt-1">TireGuru invoice #</div>
      </div>

      <p className="mt-6 text-[10px] text-slate-400">
        Portal order request — prices are dealer-tier indicative; final pricing, freight and FET per the TireGuru
        invoice of record.
      </p>
    </div>
  );
}
