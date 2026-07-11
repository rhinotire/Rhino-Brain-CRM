import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicReferralService } from "@rhino/services";
import { ShopRequestActions } from "@/components/shop-request-actions";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "A Local Customer Requested Your Shop",
  robots: { index: false, follow: false }, // secure capability page (spec §14)
};

export const dynamic = "force-dynamic";

export default async function ShopRequestPage({ params }: { params: { token: string } }) {
  const [brand, data] = await Promise.all([getBrand(), PublicReferralService.getForInstaller(params.token)]);
  if (!data) notFound();

  if (data.state === "EXPIRED") {
    return (
      <div className="mx-auto max-w-xl pt-10 text-center">
        <h1 className="text-2xl font-black">This request has expired</h1>
        <p className="mt-3 text-sm text-slate-600">
          Customer requests are held for 14 days. Want wholesale pricing for your shop anyway? Call {brand.name} at{" "}
          <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl pt-8">
      <div className="text-xs font-bold uppercase tracking-wide text-brand-dark">{brand.name} — customer referral</div>
      <h1 className="mt-1 text-2xl font-black">A Local Customer Requested Your Shop</h1>
      {data.shopName && <p className="mt-1 text-sm text-slate-500">For: {data.shopName}</p>}

      <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-5 text-sm">
        <div><span className="font-bold text-slate-500">Product:</span> {data.product}</div>
        <div><span className="font-bold text-slate-500">Quantity:</span> {data.quantity}</div>
        <div><span className="font-bold text-slate-500">Requested service:</span> Mounting &amp; balancing</div>
        {data.preferredDate && <div><span className="font-bold text-slate-500">Preferred date:</span> {new Date(data.preferredDate).toLocaleDateString()}</div>}
        {data.notes && <div><span className="font-bold text-slate-500">Notes:</span> {data.notes}</div>}
        <div className="border-t border-slate-100 pt-3">
          <span className="font-bold text-slate-500">Customer:</span> {data.consumer.name}
          <span className="ml-2 font-bold text-slate-500">ZIP:</span> {data.consumerZip}
          {data.state !== "ACCEPTED" && (
            <p className="mt-1 text-xs text-slate-400">Full contact details are released when you accept.</p>
          )}
        </div>
        {data.state === "ACCEPTED" && (
          <div className="rounded-xl bg-green-50 p-4">
            <div className="font-bold text-green-800">You accepted this customer — contact them now:</div>
            <div className="mt-1 text-green-900">
              {data.consumer.name} · <a href={`tel:${data.consumer.phone}`} className="font-bold underline">{data.consumer.phone}</a>
              {data.consumer.email ? <> · {data.consumer.email}</> : null}
            </div>
            <p className="mt-2 text-xs text-green-700">
              Need the product? {brand.name} can supply it at wholesale — call{" "}
              <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>.
            </p>
          </div>
        )}
        {data.state === "DECLINED" && (
          <p className="rounded-xl bg-slate-50 p-4 text-slate-600">You declined this request. Changed your mind? Call {brand.phoneDisplay}.</p>
        )}
      </div>

      {data.state === "OPEN" && (
        <>
          <ShopRequestActions token={params.token} />
          <p className="mt-4 text-xs text-slate-500">
            {brand.name} is a wholesale distributor ({brand.phoneDisplay}). We may have this product available from our
            warehouse and can provide your business with wholesale pricing — accepting costs nothing.
          </p>
        </>
      )}
    </div>
  );
}
