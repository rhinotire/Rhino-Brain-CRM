import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, locationScope } from "@/lib/auth";
import { Badge } from "@/components/ui/primitives";
import { ConsumerLeadStatusSelect } from "@/components/consumer-lead-status";

export const dynamic = "force-dynamic";

const WEBSITE_URL = process.env.WEBSITE_URL ?? "https://rhino-website-ten.vercel.app";

const KIND_LABEL: Record<string, string> = {
  INSTALLED_PRICE: "Installed price request",
  APPOINTMENT: "Appointment request",
  INSTALLER_NEEDED: "Installer needed",
  SEND_TO_INSTALLER: "Send to installer",
};

const MATCH_LABEL: Record<string, [string, string]> = {
  EXISTING_DEALER: ["Existing dealer", "bg-emerald-100 text-emerald-700"],
  EXISTING_INSTALLER: ["Known installer", "bg-emerald-100 text-emerald-700"],
  POSSIBLE_DUPLICATE: ["Possible duplicate — verify!", "bg-amber-100 text-amber-700"],
  NEW_PROSPECT: ["New dealer prospect", "bg-blue-100 text-blue-700"],
};

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-50 py-2 text-sm">
      <div className="w-36 shrink-0 font-semibold text-slate-500">{k}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default async function ConsumerLeadDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const lead = await db.consumerLead.findFirst({
    where: { id: params.id, ...locationScope(session) },
    include: {
      product: { select: { sku: true, name: true, description: true, sizeSpec: true } },
      installer: { select: { storeName: true, phone: true, city: true, state: true } },
      assignedRep: { select: { name: true } },
      crmLead: { select: { id: true, companyName: true, stage: true } },
      referral: { include: { matchedCustomer: { select: { id: true, companyName: true } }, quote: { select: { id: true, quoteNumber: true, status: true } } } },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lead) notFound();
  const r = lead.referral;
  const vehicle = (lead.vehicleJson as { raw?: string } | null)?.raw;

  return (
    <div className="max-w-3xl space-y-4">
      <nav className="text-xs text-slate-500">
        <Link href="/consumer-leads" className="hover:underline">Consumer Leads</Link> / {lead.name}
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{lead.name}</h1>
        <Badge>{KIND_LABEL[lead.kind] ?? lead.kind}</Badge>
        <ConsumerLeadStatusSelect id={lead.id} status={lead.status} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Consumer</h2>
        <Row k="Phone"><a href={`tel:${lead.phone}`} className="font-semibold text-blue-700 hover:underline">{lead.phone}</a> <span className="text-xs text-slate-400">(prefers {lead.preferredContact})</span></Row>
        {lead.email && <Row k="Email"><a href={`mailto:${lead.email}`} className="text-blue-700 hover:underline">{lead.email}</a></Row>}
        <Row k="ZIP">{lead.zip}</Row>
        {vehicle && <Row k="Vehicle">{vehicle}</Row>}
        {lead.preferredDate && <Row k="Preferred date">{lead.preferredDate.toLocaleDateString()}</Row>}
        {lead.message && <Row k="Notes">{lead.message}</Row>}
        <Row k="Submitted">{lead.createdAt.toLocaleString()} · via {lead.brandKey}{lead.sourceUrl ? ` · ${lead.sourceUrl}` : ""}</Row>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Request</h2>
        <Row k="Product">{lead.product ? `${lead.product.name ?? lead.product.description} (SKU ${lead.product.sku})` : lead.tireSize ?? "—"}</Row>
        <Row k="Quantity">{lead.quantity}</Row>
        <Row k="Store">{lead.installer ? `${lead.installer.storeName} — ${lead.installer.city}, ${lead.installer.state} (${lead.installer.phone})` : r?.rawName ?? "—"}</Row>
        <Row k="Assigned rep">{lead.assignedRep?.name ?? "—"}</Row>
        {lead.crmLead && (
          <Row k="Dealer lead"><Link href="/pipeline" className="text-blue-700 hover:underline">{lead.crmLead.companyName}</Link> <span className="text-xs text-slate-400">({lead.crmLead.stage.replaceAll("_", " ").toLowerCase()})</span></Row>
        )}
      </div>

      {r && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
            Installer Referral
            {MATCH_LABEL[r.matchStatus] && <Badge className={MATCH_LABEL[r.matchStatus][1]}>{MATCH_LABEL[r.matchStatus][0]}</Badge>}
          </h2>
          <Row k="Shop (as typed)">{r.rawName ?? "—"}{r.rawPhone ? ` · ${r.rawPhone}` : ""}{r.rawZip ? ` · ZIP ${r.rawZip}` : ""}</Row>
          {r.rawAddress && <Row k="Address">{r.rawAddress}</Row>}
          {r.rawWebsite && <Row k="Website">{r.rawWebsite}</Row>}
          {r.matchedCustomer && (
            <Row k="Matched customer"><Link href={`/customers/${r.matchedCustomer.id}`} className="text-blue-700 hover:underline">{r.matchedCustomer.companyName}</Link></Row>
          )}
          <Row k="Shop link">
            <span className="break-all font-mono text-xs">{WEBSITE_URL}/shop-request/{r.secureToken}</span>
            <span className="ml-2 text-xs text-slate-400">— send this to the shop (accept/decline page)</span>
          </Row>
          <Row k="Expires">{r.expiresAt.toLocaleDateString()}</Row>
          {r.quote && (
            <Row k="Draft quote"><Link href="/quotes" className="text-blue-700 hover:underline">{r.quote.quoteNumber}</Link> <span className="text-xs text-slate-400">({r.quote.status.toLowerCase()})</span></Row>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Timeline</h2>
        <ol className="space-y-2">
          {lead.statusHistory.map((h) => (
            <li key={h.id} className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 text-xs text-slate-400">{h.createdAt.toLocaleString()}</span>
              <span>
                <span className="font-semibold">{h.toStatus.replaceAll("_", " ").toLowerCase()}</span>
                <span className="text-xs text-slate-400"> · {h.actor === "system" ? "system" : h.actor === "consumer" ? "consumer" : h.actor === "installer" ? "installer" : "staff"}</span>
                {h.reason && <span className="text-xs text-slate-500"> — {h.reason}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
