import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, hasPerm, locationScope } from "@/lib/auth";
import { OPS_CATEGORIES, daysUntil } from "@/lib/ops";
import { generateOpsReminders } from "@/lib/ops-reminders";
import { chatImageUrl } from "@/lib/storage";
import { fmtDate } from "@/lib/domain";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import { OpsItemButton, RenewButton, DeleteOpsButton, NewRepairButton, RepairStatusButtons, type OpsItemDTO } from "@/components/ops-components";

export const dynamic = "force-dynamic";

/** Operations hub: the GM's "never forget" page — renewals + repair tickets. */
export default async function OpsPage() {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) redirect("/my-work");
  const manager = true; // the page itself is perm-gated — everyone here manages ops for their company
  await generateOpsReminders().catch(() => {});

  const [items, repairs] = await Promise.all([
    db.opsItem.findMany({
      where: { status: "ACTIVE", ...locationScope(session) },
      orderBy: { dueDate: "asc" },
      include: { location: { select: { shortTag: true, color: true } } },
    }),
    db.repairTicket.findMany({
      where: { ...locationScope(session) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 40,
      include: { reportedBy: { select: { name: true } }, location: { select: { shortTag: true } } },
    }),
  ]);

  const now = new Date();
  const overdue = items.filter(i => daysUntil(i.dueDate, now) < 0);
  const due30 = items.filter(i => { const d = daysUntil(i.dueDate, now); return d >= 0 && d <= 30; });
  const openRepairs = repairs.filter(r => r.status !== "DONE");
  const urgent = openRepairs.filter(r => r.priority === "URGENT");

  const dueBadge = (d: Date) => {
    const n = daysUntil(d, now);
    if (n < 0) return <Badge className="bg-red-600 text-white">OVERDUE {-n}d</Badge>;
    if (n <= 14) return <Badge className="bg-red-100 text-red-700">{n}d left</Badge>;
    if (n <= 45) return <Badge className="bg-amber-100 text-amber-800">{n}d left</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700">{n}d</Badge>;
  };
  const dto = (i: (typeof items)[number]): OpsItemDTO => ({
    id: i.id, name: i.name, category: i.category, asset: i.asset,
    dueDate: i.dueDate.toISOString(), recurrenceMonths: i.recurrenceMonths, remindDays: i.remindDays, notes: i.notes,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🛠 Operations</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Everything with a deadline — insurance, registrations, workers&apos; comp, inspections — plus warehouse repairs. Reminders go to the notification bell automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <NewRepairButton />
          {manager && <OpsItemButton />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Overdue renewals" value={overdue.length} tone={overdue.length ? "danger" : "good"} />
        <StatCard label="Due within 30 days" value={due30.length} tone={due30.length ? "warn" : "good"} />
        <StatCard label="Open repairs" value={openRepairs.length} tone={openRepairs.length ? "warn" : "good"} />
        <StatCard label="Urgent repairs" value={urgent.length} tone={urgent.length ? "danger" : "good"} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Renewals & Expirations</h2>
        <Table>
          <THead cols={["Item", "Category", "Asset / Policy", "Due", "Repeats", "", ""]} />
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && <EmptyRow colSpan={7} message="Nothing tracked yet — add the truck insurance, workers' comp and licenses so the system remembers for you." />}
            {items.map(i => (
              <tr key={i.id} className={daysUntil(i.dueDate, now) < 0 ? "bg-red-50" : ""}>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-800">{i.name}</div>
                  {i.notes && <div className="max-w-xs truncate text-xs text-slate-400">{i.notes}</div>}
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-600">{OPS_CATEGORIES[i.category]?.icon} {OPS_CATEGORIES[i.category]?.label ?? i.category}</td>
                <td className="px-3 py-2.5 text-sm text-slate-500">{i.asset ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {dueBadge(i.dueDate)}
                    <span className="text-xs text-slate-400">{fmtDate(i.dueDate)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{i.recurrenceMonths ? `every ${i.recurrenceMonths} mo` : "one-time"}</td>
                <td className="px-3 py-2.5">
                  {manager && (
                    <div className="flex items-center gap-1.5">
                      <RenewButton id={i.id} recurring={!!i.recurrenceMonths} />
                      <OpsItemButton item={dto(i)} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">{manager && <DeleteOpsButton id={i.id} name={i.name} />}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Repair Tickets</h2>
        <Table>
          <THead cols={["Problem", "Priority", "Status", "Reported", "Handling", ""]} />
          <tbody className="divide-y divide-slate-100">
            {repairs.length === 0 && <EmptyRow colSpan={6} message="No repairs reported. 🎉" />}
            {repairs.map(r => (
              <tr key={r.id} className={r.status === "DONE" ? "opacity-50" : r.priority === "URGENT" ? "bg-red-50" : ""}>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-800">{r.title}</div>
                  {r.details && <div className="max-w-sm truncate text-xs text-slate-400">{r.details}</div>}
                  {r.photoPath && chatImageUrl(r.photoPath) && (
                    <a href={chatImageUrl(r.photoPath)!} target="_blank" rel="noopener" className="text-xs text-brand-600 underline">📷 photo</a>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge className={r.priority === "URGENT" ? "bg-red-600 text-white" : r.priority === "LOW" ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-600"}>
                    {r.priority}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge className={r.status === "OPEN" ? "bg-amber-100 text-amber-800" : r.status === "IN_PROGRESS" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}>
                    {r.status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(r.createdAt)} · {r.reportedBy.name}</td>
                <td className="px-3 py-2.5 text-sm text-slate-600">{r.assignee ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <RepairStatusButtons id={r.id} status={r.status} assignee={r.assignee} canManage={manager} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
