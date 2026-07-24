import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting, locationScope } from "@/lib/auth";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import { NewTaskButton } from "@/components/task-form";
import { NewQuoteButton } from "@/components/quote-form";
import { EditCustomerButton } from "@/components/edit-customer-button";
import { TaskActions } from "@/components/task-form";
import { CustomerDocuments } from "@/components/customer-documents";
import { DealerPortalAccess } from "@/components/dealer-portal-access";
import { isStorageConfigured } from "@/lib/storage";
import {
  customerTypeLabels, customerStatusLabels, customerSourceLabels, productLabels,
  activityTypeLabels, quoteStatusLabels, taskPriorityLabels,
  customerTemperature, temperatureClasses, temperatureLabels,
  fmtDate, fmtDateTime, fmtMoney, daysSince,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const manager = isManager(session);
  const accounting = isAccounting(session);

  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      assignedRep: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 50, include: { rep: { select: { name: true } }, quote: { select: { quoteNumber: true } } } },
      quotes: { orderBy: { quoteDate: "desc" }, include: { rep: { select: { name: true } } } },
      tasks: { orderBy: { dueDate: "asc" }, include: { assignee: { select: { name: true } } } },
      opportunities: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      orders: { orderBy: { orderDate: "desc" }, take: 12 },
      dealerUsers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!customer) notFound();
  if (!manager && !accounting && customer.assignedRepId !== session.userId) notFound();
  // location isolation: managers/reps (and admins with a location filter) cannot open other locations' customers
  const locGuard = locationScope(session);
  if (locGuard.locationId && customer.locationId && customer.locationId !== locGuard.locationId) notFound();

  const reps = manager
    ? await db.user.findMany({ where: { active: true, ...locationScope(session) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const temp = customerTemperature(customer.lastContactAt);
  const days = daysSince(customer.lastContactAt);
  const openTasks = customer.tasks.filter(t => t.status === "OPEN");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{customer.companyName}</h1>
            <Badge className={temperatureClasses[temp]}>{temperatureLabels[temp]}</Badge>
            <Badge className="bg-slate-100 text-slate-700">Tier {customer.tier}</Badge>
            <Badge className="bg-ink-900 text-white">Score {customer.score}</Badge>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {customerTypeLabels[customer.type]} · {customerStatusLabels[customer.status]} ·
            {" "}Rep: {customer.assignedRep?.name ?? "Unassigned"} ·
            {" "}Last contact: {fmtDate(customer.lastContactAt)}{days !== null && ` (${days}d ago)`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!accounting && <>
          <QuickLogButton customerId={customer.id} label="Log Call" defaultType="CALL" />
          <QuickLogButton customerId={customer.id} label="Add Note" defaultType="INTERNAL_NOTE" variant="secondary" />
          <NewQuoteButton customers={[{ id: customer.id, companyName: customer.companyName }]} defaultCustomerId={customer.id} label="Create Quote" />
          <NewTaskButton customers={[{ id: customer.id, companyName: customer.companyName }]} defaultCustomerId={customer.id}
            users={reps} canAssign={manager} selfId={session.userId} label="Set Follow-up" />
          <EditCustomerButton
            customerId={customer.id}
            canAssign={manager}
            reps={reps}
            values={{
              companyName: customer.companyName,
              contactPerson: customer.contactPerson ?? undefined,
              phone: customer.phone ?? undefined,
              contactCell: customer.contactCell ?? undefined,
              email: customer.email ?? undefined,
              website: customer.website ?? undefined,
              facebookUrl: customer.facebookUrl ?? undefined,
              instagramUrl: customer.instagramUrl ?? undefined,
              whatsapp: customer.whatsapp ?? undefined,
              address: customer.address ?? undefined,
              city: customer.city ?? undefined,
              state: customer.state ?? undefined,
              zip: customer.zip ?? undefined,
              type: customer.type,
              status: customer.status,
              source: customer.source,
              mainInterest: customer.mainInterest,
              tier: customer.tier,
              creditLimit: customer.creditLimit ? String(customer.creditLimit) : undefined,
              paymentTerms: customer.paymentTerms ?? undefined,
              nextFollowUpAt: customer.nextFollowUpAt ? customer.nextFollowUpAt.toISOString().slice(0, 10) : undefined,
              notes: customer.notes ?? undefined,
              assignedRepId: customer.assignedRepId ?? undefined,
            }}
          />
          </>}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Left: profile */}
        <div className="space-y-5">
          <Card title="Profile">
            {(() => {
              const keyFields: [string, unknown][] = [
                ["Contact", customer.contactPerson],
                ["Company phone", customer.phone],
                ["Contact cell", customer.contactCell],
                ["Email", customer.email],
                ["Address", customer.address || customer.city],
              ];
              const filled = keyFields.filter(([, v]) => v).length;
              const pct = Math.round((filled / keyFields.length) * 100);
              const missing = keyFields.filter(([, v]) => !v).map(([k]) => k);
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">Profile completeness</span>
                    <span className={pct === 100 ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div className={`h-1.5 rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  {missing.length > 0 && <p className="mt-1.5 text-xs text-red-500">Missing: {missing.join(", ")}</p>}
                </div>
              );
            })()}
            <dl className="space-y-2 text-sm">
              {[
                ["Contact", customer.contactPerson],
                ["Company phone", customer.phone],
                ["Contact cell", customer.contactCell],
                ["Email", customer.email],
                ["WhatsApp", customer.whatsapp],
                ["Website", customer.website],
                ["Facebook", customer.facebookUrl],
                ["Instagram", customer.instagramUrl],
                ["Address", [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")],
                ["Source", customerSourceLabels[customer.source]],
                ["Main interest", productLabels[customer.mainInterest]],
                ["Credit limit", customer.creditLimit ? fmtMoney(Number(customer.creditLimit)) : null],
                ["Payment terms", customer.paymentTerms],
                ["Next follow-up", customer.nextFollowUpAt ? fmtDate(customer.nextFollowUpAt) : null],
              ].map(([k, v]) => {
                // Nudge reps to fill these — highlight in red when empty.
                const nudge = (k === "Contact cell" || k === "Email") && !v;
                return (
                  <div key={k as string} className="flex justify-between gap-3">
                    <dt className={nudge ? "font-medium text-red-600" : "text-slate-400"}>{k}</dt>
                    <dd className={`text-right font-medium ${nudge ? "text-red-600" : "text-slate-700"}`}>
                      {nudge ? "⚠ Add this" : (v || "—")}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {customer.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {customer.tags.map(t => <Badge key={t.tagId} className="bg-slate-100 text-slate-600">#{t.tag.name}</Badge>)}
              </div>
            )}
            {customer.notes && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-slate-600">{customer.notes}</p>}
          </Card>

          <Card title="Open Tasks">
            <div className="space-y-2">
              {openTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-slate-400">Due {fmtDate(t.dueDate)} · {t.assignee.name} · {taskPriorityLabels[t.priority]}</div>
                  </div>
                  <TaskActions taskId={t.id} status={t.status} />
                </div>
              ))}
              {openTasks.length === 0 && <div className="py-4 text-center text-sm text-slate-400">No open tasks.</div>}
            </div>
          </Card>

          {customer.orders.length > 0 && (() => {
            const now = new Date();
            const d90 = new Date(now.getTime() - 90 * 86400000);
            const d180 = new Date(now.getTime() - 180 * 86400000);
            const lifetime = customer.orders.reduce((s, o) => s + Number(o.total), 0);
            const last90 = customer.orders.filter(o => o.orderDate >= d90).reduce((s, o) => s + Number(o.total), 0);
            const prior90 = customer.orders.filter(o => o.orderDate < d90 && o.orderDate >= d180).reduce((s, o) => s + Number(o.total), 0);
            const dropping = prior90 >= 500 && last90 < prior90 * 0.5;
            return (
              <Card title="🧾 Order History">
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-xs text-slate-400">Lifetime (shown)</div><div className="font-bold text-slate-800">{fmtMoney(lifetime)}</div></div>
                  <div><div className="text-xs text-slate-400">Last 90d</div><div className={`font-bold ${dropping ? "text-red-600" : "text-slate-800"}`}>{fmtMoney(last90)}</div></div>
                  <div><div className="text-xs text-slate-400">Prior 90d</div><div className="font-bold text-slate-800">{fmtMoney(prior90)}</div></div>
                </div>
                {dropping && <div className="mb-2 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">⚠ Buying is down sharply vs the prior 90 days — worth a check-in.</div>}
                <div className="space-y-1">
                  {customer.orders.map(o => (
                    <div key={o.id} className="flex justify-between border-b border-slate-50 py-1 text-sm">
                      <span className="text-slate-500">{fmtDate(o.orderDate)}{o.externalId && <span className="ml-1 text-xs text-slate-400">#{o.externalId}</span>}</span>
                      <span className="font-medium text-slate-700">{fmtMoney(Number(o.total))}</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })()}

          <Card title="📄 Documents">
            <CustomerDocuments
              customerId={customer.id}
              isManager={manager}
              isAccounting={accounting}
              canUpload={!accounting}
              storageReady={isStorageConfigured()}
              docs={customer.documents.map(d => ({
                id: d.id, type: d.type, fileName: d.fileName,
                expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
                sensitive: d.sensitive, createdAt: d.createdAt.toISOString(),
                uploadedBy: d.uploadedBy.name,
              }))}
            />
          </Card>

          {!accounting && (
            <Card title="🔑 Dealer Portal Access">
              <DealerPortalAccess
                customerId={customer.id}
                users={customer.dealerUsers.map(u => ({
                  id: u.id, name: u.name, email: u.email, active: u.active,
                  lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
                }))}
                defaultName={customer.contactPerson ?? ""}
                defaultEmail={customer.email ?? ""}
              />
            </Card>
          )}
        </div>

        {/* Middle: activity timeline */}
        <Card title="Contact History" className="xl:col-span-1">
          <ol className="relative space-y-4 border-l border-slate-200 pl-4">
            {customer.activities.map(a => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
                <div className="text-xs text-slate-400">{fmtDateTime(a.occurredAt)} · {a.rep.name}</div>
                <div className="text-sm font-medium text-slate-800">
                  <Badge className="mr-1.5 bg-slate-100 text-slate-600">{activityTypeLabels[a.type]}</Badge>
                  {a.subject}
                  {a.quote && <span className="ml-1 text-xs text-brand-600">({a.quote.quoteNumber})</span>}
                </div>
                {a.notes && <p className="mt-0.5 text-sm text-slate-500">{a.notes}</p>}
                {a.outcome && <p className="mt-0.5 text-xs text-emerald-700">→ {a.outcome}</p>}
              </li>
            ))}
            {customer.activities.length === 0 && <li className="py-4 text-sm text-slate-400">No activity yet — log the first call.</li>}
          </ol>
        </Card>

        {/* Right: quotes + opportunities */}
        <div className="space-y-5">
          <Card title="Quote History" action={<Link href="/quotes" className="text-xs text-brand-600 hover:underline">All quotes →</Link>}>
            <div className="space-y-2">
              {customer.quotes.map(q => (
                <div key={q.id} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{q.quoteNumber}</span>
                    <Badge className={
                      q.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" :
                      q.status === "REJECTED" || q.status === "EXPIRED" ? "bg-red-100 text-red-700" :
                      q.status === "FOLLOW_UP_NEEDED" ? "bg-amber-100 text-amber-800" :
                      "bg-sky-100 text-sky-800"
                    }>{quoteStatusLabels[q.status]}</Badge>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs text-slate-400">
                    <span>{fmtDate(q.quoteDate)} · {q.rep.name}</span>
                    <span className="font-semibold text-slate-700">{fmtMoney(Number(q.total))}</span>
                  </div>
                </div>
              ))}
              {customer.quotes.length === 0 && <div className="py-4 text-center text-sm text-slate-400">No quotes yet.</div>}
            </div>
          </Card>

          <Card title="Opportunities">
            <div className="space-y-2">
              {customer.opportunities.map(o => (
                <div key={o.id} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{productLabels[o.category]}</span>
                    <Badge className={o.status === "WON" ? "bg-emerald-100 text-emerald-800" : o.status === "LOST" ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-800"}>{o.status}</Badge>
                  </div>
                  <div className="text-xs text-slate-400">
                    {o.estMonthlyVolume && `~${o.estMonthlyVolume}/mo · `}
                    {o.currentSupplier && `now buying from ${o.currentSupplier} · `}
                    {o.probability} probability
                  </div>
                  {o.nextAction && <div className="text-xs text-slate-500">Next: {o.nextAction}</div>}
                </div>
              ))}
              {customer.opportunities.length === 0 && <div className="py-4 text-center text-sm text-slate-400">No opportunities tracked.</div>}
            </div>
          </Card>

          <Card title="🤖 AI Assistant">
            <Link href="/assistant" className="block rounded-md border border-dashed border-brand-300 bg-brand-50/50 p-3 text-sm text-brand-700 hover:bg-brand-50">
              Draft a follow-up email/text for this customer, or ask about your book of business →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
