import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightQuoteTable, ShipmentStatusButtons, CheckRepliesButton } from "@/components/freight-quote-table";

export const dynamic = "force-dynamic";

export default async function FreightDetailPage({ params }: { params: { id: string } }) {
  await requireManager();
  const s = await db.freightShipment.findUnique({
    where: { id: params.id },
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: { include: { carrier: { include: { contacts: { where: { active: true } } } } } },
    },
  });
  if (!s) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-mono text-xl font-bold">{s.refCode} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 font-sans text-sm">{s.status}</span></h1>
        <CheckRepliesButton />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <p><b>{s.originLabel}</b> → {s.stops.map((st) => `${st.sequence}. ${st.consignee.name} (${st.consignee.city}, ${st.consignee.state})${st.quantity ? ` — ${st.quantity}` : ""}`).join("  ·  ")}</p>
        <p className="mt-1 text-slate-500">提货 {s.pickupDate.toISOString().slice(0, 10)} · {s.equipmentType === "DRY_VAN_53" ? "53' Dry Van" : "53' Flatbed"} · {s.commodity}{s.notes ? ` · ${s.notes}` : ""}</p>
        {s.status === "BOOKED" && !s.confirmationSentAt && <p className="mt-1 font-semibold text-red-600">⚠ 确认邮件未发出 — 用下面的&quot;重发确认邮件&quot;</p>}
      </div>

      <FreightQuoteTable
        shipmentStatus={s.status}
        awardedQuoteId={s.awardedQuoteId}
        quotes={s.quotes.map((q) => ({
          id: q.id,
          carrierName: q.carrier.name,
          status: q.status,
          price: q.price === null ? null : Number(q.price),
          transitDays: q.transitDays,
          notes: q.notes,
          rawReplyExcerpt: q.rawReplyExcerpt,
          repliedAt: q.repliedAt?.toISOString() ?? null,
          lastError: q.lastError,
        }))}
      />

      <ShipmentStatusButtons shipmentId={s.id} status={s.status} confirmationSent={Boolean(s.confirmationSentAt)} />
    </div>
  );
}
