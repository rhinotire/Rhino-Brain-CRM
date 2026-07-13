import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import { ConsumerLeadStatusSelect } from "@/components/consumer-lead-status";
import type { Prisma, ConsumerLeadStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const OPEN_STATUSES: ConsumerLeadStatus[] = [
  "SUBMITTED", "INSTALLER_NEEDED", "INSTALLER_CONTACTED", "INSTALLATION_REQUESTED",
  "INSTALLATION_SCHEDULED", "MANUAL_ASSISTANCE_REQUIRED",
];

const KIND_LABEL: Record<string, string> = {
  INSTALLED_PRICE: "Installed price",
  APPOINTMENT: "Appointment",
  INSTALLER_NEEDED: "Installer needed",
  SEND_TO_INSTALLER: "Send to installer",
};

type Search = { status?: string; focus?: string };

export default async function ConsumerLeadsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const scope = locationScope(session);

  const where: Prisma.ConsumerLeadWhereInput = { ...scope };
  if (searchParams.status === "open") where.status = { in: OPEN_STATUSES };
  else if (searchParams.status === "done") where.status = { notIn: OPEN_STATUSES };

  const [leads, openCount, weekCount] = await Promise.all([
    db.consumerLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        product: { select: { sku: true, name: true, description: true } },
        installer: { select: { storeName: true } },
        assignedRep: { select: { name: true } },
      },
    }),
    db.consumerLead.count({ where: { ...scope, status: { in: OPEN_STATUSES } } }),
    db.consumerLead.count({ where: { ...scope, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Consumer Leads <span className="text-sm font-normal text-slate-400">(website installation requests)</span></h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Open requests" value={openCount} />
        <StatCard label="New this week" value={weekCount} />
      </div>

      <div className="flex gap-2 text-sm">
        {[["", "All"], ["open", "Open"], ["done", "Closed"]].map(([v, l]) => (
          <Link key={v} href={v ? `/consumer-leads?status=${v}` : "/consumer-leads"}
            className={`rounded-full px-3 py-1 font-semibold ${(searchParams.status ?? "") === v ? "bg-ink text-white bg-slate-800" : "bg-slate-100 text-slate-600"}`}>
            {l}
          </Link>
        ))}
      </div>

      <Table>
        <THead cols={["When", "Type", "Consumer", "Phone", "ZIP", "Product / Size", "Qty", "Store", "Rep", "Status"]} />
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className={`border-b border-slate-50 hover:bg-slate-50 ${searchParams.focus === l.id ? "bg-amber-50" : ""}`}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{l.createdAt.toLocaleDateString()} {l.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
              <td className="px-3 py-2"><Badge>{KIND_LABEL[l.kind] ?? l.kind}</Badge></td>
              <td className="px-3 py-2 font-medium">
                <Link href={`/consumer-leads/${l.id}`} className="text-blue-700 hover:underline">{l.name}</Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2"><a href={`tel:${l.phone}`} className="text-blue-700 hover:underline">{l.phone}</a></td>
              <td className="px-3 py-2">{l.zip}</td>
              <td className="px-3 py-2 text-slate-600">{l.product ? `${l.product.name ?? l.product.description} (${l.product.sku})` : l.tireSize ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{l.quantity}</td>
              <td className="px-3 py-2">{l.installer?.storeName ?? <span className="text-amber-600 font-semibold">none</span>}</td>
              <td className="px-3 py-2">{l.assignedRep?.name ?? "—"}</td>
              <td className="px-3 py-2"><ConsumerLeadStatusSelect id={l.id} status={l.status} /></td>
            </tr>
          ))}
          {leads.length === 0 && <EmptyRow colSpan={10} message="No consumer leads yet — they appear here when someone requests installation on the website." />}
        </tbody>
      </Table>
      {leads.length === 200 && <p className="text-xs text-slate-400">Showing latest 200.</p>}
    </div>
  );
}
