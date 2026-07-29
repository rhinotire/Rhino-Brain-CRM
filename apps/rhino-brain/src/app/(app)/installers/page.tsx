import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, isManager, locationScope, seesAllLocations, adminLocFilter } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { toggleInstallerActive } from "@/actions/installers";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  OWNED: "bg-amber-100 text-amber-800",
  PREFERRED: "bg-emerald-100 text-emerald-800",
  PARTNER: "bg-sky-100 text-sky-800",
  PROSPECT: "bg-slate-100 text-slate-600",
};

const CAP_SHORT: [string, string][] = [
  ["passenger", "PSR"], ["lightTruck", "LT"], ["trailer", "ST"], ["tbr", "TBR"], ["wheels", "Wheels"], ["mobileService", "Mobile"],
];

export default async function InstallersPage() {
  const session = await requireSession();
  const manager = isManager(session);
  const showLocCol = seesAllLocations(session) && !adminLocFilter();

  const installers = await db.installer.findMany({
    where: { ...locationScope(session) },
    orderBy: [{ active: "desc" }, { preferredStatus: "asc" }, { storeName: "asc" }],
    include: {
      customer: { select: { id: true, companyName: true } },
      location: { select: { shortTag: true, name: true } },
      _count: { select: { consumerLeads: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Installers <span className="text-sm font-normal text-slate-400">({installers.length})</span></h1>
          <p className="mt-0.5 text-xs text-slate-500">
            The install network shown on the website&apos;s Find Installation page — consumers within a store&apos;s service radius see it as an option.
          </p>
        </div>
        {manager && (
          <Link href="/installers/new" className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
            + Add Installer
          </Link>
        )}
      </div>

      <Table>
        <THead cols={["Store", "Location", "Phone", "Radius", "Services", "Status", "Leads", ...(showLocCol ? ["Company"] : []), ...(manager ? ["Actions"] : [])]} />
        <tbody className="divide-y divide-slate-100">
          {installers.length === 0 && <EmptyRow colSpan={9} message="No installers yet — add your first, or convert a dealer customer." />}
          {installers.map((i) => (
            <tr key={i.id} className={i.active ? "" : "opacity-50"}>
              <td className="px-3 py-2.5">
                {manager ? (
                  <Link href={`/installers/${i.id}`} className="font-medium text-brand-700 hover:underline">{i.storeName}</Link>
                ) : (
                  <span className="font-medium text-slate-800">{i.storeName}</span>
                )}
                {i.customer && (
                  <div className="text-xs text-slate-400">
                    ↳ customer: <Link href={`/customers/${i.customer.id}`} className="hover:underline">{i.customer.companyName}</Link>
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{i.city}, {i.state} {i.zip}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{i.phone}</td>
              <td className="px-3 py-2.5 text-slate-600">{i.serviceRadiusMi} mi</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {CAP_SHORT.filter(([k]) => (i as unknown as Record<string, boolean>)[k]).map(([k, label]) => (
                    <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{label}</span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2.5">
                <Badge className={STATUS_BADGE[i.preferredStatus]}>{i.preferredStatus}</Badge>
                {!i.active && <Badge className="ml-1 bg-red-100 text-red-700">Inactive</Badge>}
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">{i._count.consumerLeads}</td>
              {showLocCol && <td className="px-3 py-2.5 text-xs text-slate-500">{i.location.shortTag ?? i.location.name}</td>}
              {manager && (
                <td className="px-3 py-2.5">
                  <form action={toggleInstallerActive.bind(null, i.id)}>
                    <button className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
                      {i.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>

      <p className="text-xs text-slate-400">
        Routing: the OWNED store wins inside its radius; otherwise up to 3 partners sorted preferred-first, then distance. Distance is ZIP-to-ZIP.
      </p>
    </div>
  );
}
