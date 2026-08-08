import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Select, Button } from "@/components/ui/primitives";
import { NewTaskButton, TaskActions } from "@/components/task-form";
import { taskPriorityLabels, taskStatusLabels, taskTypeLabels, fmtDate } from "@/lib/domain";
import Link from "next/link";
import type { Prisma, TaskStatus, TaskPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { status?: string; priority?: string; assignee?: string };

export default async function TasksPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const manager = isManager(session);
  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const where: Prisma.TaskWhereInput = { ...repScope(session, "assigneeId"), ...locationScope(session) };
  where.status = (searchParams.status as TaskStatus) || "OPEN";
  if (searchParams.status === "ALL") delete where.status;
  if (searchParams.priority) where.priority = searchParams.priority as TaskPriority;
  if (manager && searchParams.assignee) where.assigneeId = searchParams.assignee;

  const [tasks, customers, users] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      include: {
        assignee: { select: { name: true } },
        creator: { select: { name: true } },
        customer: { select: { id: true, companyName: true } },
      },
      take: 300,
    }),
    db.customer.findMany({ where: { ...repScope(session), ...locationScope(session) }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" }, take: 500 }),
    db.user.findMany({ where: { active: true, ...locationScope(session) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const overdue = (d: Date | null) => d && d < now && d.toDateString() !== now.toDateString();
  const dueToday = (d: Date | null) => d && d.toDateString() === now.toDateString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tasks <span className="text-sm font-normal text-slate-400">({tasks.length})</span></h1>
        <NewTaskButton customers={customers} users={users} canAssign={manager} selfId={session.userId} />
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-40">
          <Select name="status" defaultValue={searchParams.status ?? "OPEN"}>
            <option value="OPEN">Open</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELED">Canceled</option>
            <option value="ALL">All</option>
          </Select>
        </div>
        <div className="w-40">
          <Select name="priority" defaultValue={searchParams.priority ?? ""}>
            <option value="">All priorities</option>
            {Object.entries(taskPriorityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        {manager && (
          <div className="w-44">
            <Select name="assignee" defaultValue={searchParams.assignee ?? ""}>
              <option value="">All assignees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
        )}
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Table>
        <THead cols={["Task", "Type", "Priority", "Customer", "Assignee", "Due", "Status", "Actions"]} />
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} className={`border-b border-slate-50 ${overdue(t.dueDate) && t.status === "OPEN" ? "bg-red-50/60" : "hover:bg-slate-50"}`}>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{t.title}</div>
                {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                <div className="text-[11px] text-slate-400">by {t.creator.name}</div>
              </td>
              <td className="px-3 py-2">{taskTypeLabels[t.type]}</td>
              <td className="px-3 py-2">
                <Badge className={t.priority === "HIGH" ? "bg-red-100 text-red-700" : t.priority === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>
                  {taskPriorityLabels[t.priority]}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {t.customer ? <Link href={`/customers/${t.customer.id}`} className="text-brand-700 hover:underline">{t.customer.companyName}</Link> : "—"}
              </td>
              <td className="px-3 py-2 text-slate-600">{t.assignee.name}</td>
              <td className="px-3 py-2">
                <span className={overdue(t.dueDate) && t.status === "OPEN" ? "font-semibold text-red-600" : dueToday(t.dueDate) ? "font-semibold text-amber-600" : ""}>
                  {fmtDate(t.dueDate)}
                  {overdue(t.dueDate) && t.status === "OPEN" && " · Overdue"}
                  {dueToday(t.dueDate) && t.status === "OPEN" && " · Today"}
                </span>
              </td>
              <td className="px-3 py-2"><Badge className={t.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : t.status === "CANCELED" ? "bg-slate-100 text-slate-500" : "bg-sky-50 text-sky-700"}>{taskStatusLabels[t.status]}</Badge></td>
              <td className="px-3 py-2"><TaskActions taskId={t.id} status={t.status} /></td>
            </tr>
          ))}
          {tasks.length === 0 && <EmptyRow colSpan={8} message="No tasks here. Enjoy the quiet — or create one." />}
        </tbody>
      </Table>
    </div>
  );
}
