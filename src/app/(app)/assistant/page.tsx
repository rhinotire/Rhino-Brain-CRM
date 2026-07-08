import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, repScope, locationScope } from "@/lib/auth";
import { Card, Badge } from "@/components/ui/primitives";
import { getPriorityFollowUps, isAiConfigured } from "@/actions/ai";
import { MessageGenerator, AskBox } from "@/components/ai-assistant";
import { QuickLogButton } from "@/components/quick-log";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const session = await requireSession();
  const aiReady = await isAiConfigured();
  const { items, aiUsed, error } = await getPriorityFollowUps();

  const customers = await db.customer.findMany({
    where: { ...repScope(session), ...locationScope(session) },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">🤖 AI Assistant</h1>
        <p className="text-sm text-slate-500">
          Priority calls, ready-to-send messages, and answers about your book of business.
          {!aiReady && <span className="ml-1 text-amber-600">AI drafting is not configured yet (admin: set ANTHROPIC_API_KEY) — the priority list below still works.</span>}
        </p>
        {error && <p className="text-xs text-amber-600">AI coaching unavailable right now ({error}) — showing rule-based tips.</p>}
      </div>

      <Card title={`📞 Who to call today — top ${items.length}${aiUsed ? " · tips by Claude" : ""}`}>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.customerId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/customers/${item.customerId}`} className="font-medium text-brand-700 hover:underline">{item.companyName}</Link>
                  <Badge className="bg-red-100 text-red-700">{item.reason}</Badge>
                  <span className="text-xs text-slate-400">{item.metric}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">💡 {item.tip}</p>
              </div>
              <QuickLogButton customerId={item.customerId} label="📞 Log Call" size="sm" variant="secondary" />
            </div>
          ))}
          {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nothing urgent — every follow-up is on schedule. 🎉</p>}
        </div>
      </Card>

      <MessageGenerator customers={customers} />
      <AskBox />
    </div>
  );
}
