import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, isAccounting, repScope, locationScope } from "@/lib/auth";
import { fmtMoney } from "@/lib/domain";
import { isAiConfigured } from "@/actions/ai";
import { CollectionsActions } from "@/components/collections-actions";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const bucketLabel = (days: number) =>
  days > 120 ? "120+" : days > 90 ? "91-120" : days > 60 ? "61-90" : days > 30 ? "31-60" : "1-30";
const BUCKET_STYLE: Record<string, string> = {
  "1-30": "bg-amber-100 text-amber-800",
  "31-60": "bg-orange-100 text-orange-800",
  "61-90": "bg-red-100 text-red-700",
  "91-120": "bg-red-100 text-red-800",
  "120+": "bg-red-600 text-white",
};

export default async function CollectionsPage() {
  const session = await requireSession();
  const now = new Date();

  // overdue, positive, matched to a customer, inside the caller's scope
  const where: Prisma.InvoiceWhereInput = {
    balance: { gt: 0 },
    dueDate: { lt: now },
    customerId: { not: null },
    ...locationScope(session),
    ...(session.role === "SALES_REP" ? { customer: { ...repScope(session) } } : {}),
  };
  const [invoices, aiReady] = await Promise.all([
    db.invoice.findMany({
      where,
      select: {
        customerId: true, balance: true, dueDate: true,
        customer: {
          select: {
            companyName: true, phone: true, email: true,
            assignedRep: { select: { name: true } },
            tasks: { where: { status: "OPEN", title: { startsWith: "Collect " } }, select: { id: true, assignee: { select: { name: true } } }, take: 1 },
          },
        },
      },
    }),
    isAiConfigured(),
  ]);

  type Row = {
    customerId: string; name: string; phone: string | null; rep: string | null;
    total: number; worstDays: number; items: number; openTask: string | null;
  };
  const byCustomer = new Map<string, Row>();
  for (const inv of invoices) {
    const id = inv.customerId!;
    const days = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
    const row = byCustomer.get(id) ?? {
      customerId: id,
      name: inv.customer!.companyName,
      phone: inv.customer!.phone,
      rep: inv.customer!.assignedRep?.name ?? null,
      total: 0, worstDays: 0, items: 0,
      openTask: inv.customer!.tasks[0] ? (inv.customer!.tasks[0].assignee?.name ?? "assigned") : null,
    };
    row.total += Number(inv.balance);
    row.worstDays = Math.max(row.worstDays, days);
    row.items++;
    byCustomer.set(id, row);
  }
  const rows = [...byCustomer.values()].filter(r => r.total > 0.005).sort((a, b) => b.total - a.total);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  const over120 = rows.filter(r => r.worstDays > 120);

  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-400"><Link href="/ar" className="hover:underline">A/R Aging</Link> / Collections</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Collections Workbench</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            One row per customer with overdue balance, worst first. 📋 assigns a follow-up task to the customer&apos;s rep; ✉️ drafts a collection email from the live A/R numbers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Customers overdue" value={rows.length} />
        <StatCard label="Total to collect" value={fmtMoney(grand)} tone="danger" />
        <StatCard label="120+ day customers" value={over120.length} tone="danger" hint={fmtMoney(over120.reduce((s, r) => s + r.total, 0))} />
        <StatCard label="With open task" value={rows.filter(r => r.openTask).length} tone="good" hint="already being worked" />
      </div>

      <Table>
        <THead cols={["Customer", "Rep", "Overdue", "Oldest", "Items", "Task", ...(isAccounting(session) ? [] : ["Actions"])]} />
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && <EmptyRow colSpan={7} message="No overdue balances — nothing to collect. 🎉" />}
          {rows.map(r => (
            <tr key={r.customerId}>
              <td className="px-3 py-2.5">
                <Link href={`/customers/${r.customerId}`} className="font-medium text-brand-700 hover:underline">{r.name}</Link>
                {r.phone && <div className="text-xs text-slate-400">{r.phone}</div>}
              </td>
              <td className="px-3 py-2.5 text-slate-600">{r.rep ?? <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-2.5 font-semibold tabular-nums">{fmtMoney(r.total)}</td>
              <td className="px-3 py-2.5">
                <Badge className={BUCKET_STYLE[bucketLabel(r.worstDays)]}>{r.worstDays}d</Badge>
              </td>
              <td className="px-3 py-2.5 tabular-nums text-slate-500">{r.items}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{r.openTask ? `→ ${r.openTask}` : "—"}</td>
              {!isAccounting(session) && (
                <td className="px-3 py-2.5"><CollectionsActions customerId={r.customerId} aiReady={aiReady} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
