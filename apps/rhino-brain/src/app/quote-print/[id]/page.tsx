import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, repScope, locationScope } from "@/lib/auth";
import { isEmailConfigured } from "@rhino/services";
import { brandAssetUrl } from "@/lib/storage";
import { fmtMoney, fmtDate } from "@/lib/domain";
import { QuoteSendBar } from "@/components/quote-send-bar";

export const dynamic = "force-dynamic";

export default async function QuotePrintPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const quote = await db.quote.findFirst({
    where: { id: params.id, ...repScope(session, "repId"), ...locationScope(session) },
    include: {
      items: true,
      rep: { select: { name: true } },
      customer: { select: { companyName: true, contactPerson: true, address: true, city: true, state: true, zip: true, email: true, phone: true, whatsapp: true } },
    },
  });
  if (!quote) notFound();

  const brand = quote.locationId ? await db.brandConfig.findFirst({ where: { locationId: quote.locationId } }) : null;
  const loc = quote.locationId ? await db.location.findUnique({ where: { id: quote.locationId }, select: { name: true, city: true } }) : null;
  const companyName = brand?.name ?? loc?.name ?? "Rhino Tire USA";
  const logo = brandAssetUrl(brand?.logoPath);
  const c = quote.customer;
  const addr = [c?.address, [c?.city, c?.state].filter(Boolean).join(", "), c?.zip].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[820px] bg-white p-8 text-slate-900 print:p-0">
      <QuoteSendBar
        quoteId={quote.id} emailConfigured={isEmailConfigured(brand?.key)}
        email={c?.email} phone={c?.phone} whatsapp={c?.whatsapp}
        quoteNumber={quote.quoteNumber} total={fmtMoney(Number(quote.total))}
        company={companyName} contactName={c?.contactPerson}
      />

      {/* Letterhead */}
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={companyName} className="h-12 w-12 rounded object-contain" />}
          <div>
            <div className="text-lg font-black tracking-tight">{companyName}</div>
            <div className="text-xs text-slate-500">
              {brand?.phoneDisplay ?? ""}{brand?.contactEmail ? ` · ${brand.contactEmail}` : ""}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tracking-tight text-slate-800">QUOTE</div>
          <div className="text-sm font-semibold">{quote.quoteNumber}</div>
          <div className="text-xs text-slate-500">Date: {fmtDate(quote.quoteDate)}</div>
          {quote.expirationDate && <div className="text-xs text-slate-500">Valid until: {fmtDate(quote.expirationDate)}</div>}
        </div>
      </div>

      {/* Bill to */}
      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prepared for</div>
        <div className="mt-0.5 font-bold">{c?.companyName}</div>
        {c?.contactPerson && <div className="text-sm text-slate-600">Attn: {c.contactPerson}</div>}
        {addr && <div className="text-sm text-slate-500">{addr}</div>}
        {(c?.phone || c?.email) && <div className="text-sm text-slate-500">{[c?.phone, c?.email].filter(Boolean).join(" · ")}</div>}
      </div>

      {/* Line items */}
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 px-2">Size / SKU</th>
            <th className="py-2 px-2">Brand</th>
            <th className="py-2 px-2 text-right">Qty</th>
            <th className="py-2 px-2 text-right">Unit</th>
            <th className="py-2 pl-2 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map(it => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="py-2 pr-2">{it.description}</td>
              <td className="py-2 px-2 text-slate-600">{it.sizeSku ?? "—"}</td>
              <td className="py-2 px-2 text-slate-600">{it.brand ?? "—"}</td>
              <td className="py-2 px-2 text-right tabular-nums">{it.quantity}</td>
              <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(Number(it.unitPrice))}</td>
              <td className="py-2 pl-2 text-right font-medium tabular-nums">{fmtMoney(Number(it.lineTotal))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-56">
          <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base font-black">
            <span>Total</span><span className="tabular-nums">{fmtMoney(Number(quote.total))}</span>
          </div>
          {quote.competitorBrand && quote.competitorPrice != null && (
            <div className="mt-1 text-right text-xs text-slate-400">vs {quote.competitorBrand}: {fmtMoney(Number(quote.competitorPrice))}</div>
          )}
        </div>
      </div>

      {quote.notes && (
        <div className="mt-6 rounded-md bg-slate-50 p-3 text-sm text-slate-600 print:bg-white print:p-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</div>
          <div className="mt-0.5 whitespace-pre-wrap">{quote.notes}</div>
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-400">
        Prepared by {quote.rep?.name ?? ""} · {companyName}. Prices subject to stock availability. Thank you for your business.
      </div>
    </div>
  );
}
