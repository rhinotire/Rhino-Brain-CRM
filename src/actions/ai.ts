"use server";

import Anthropic from "@anthropic-ai/sdk";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireSession, repScope, locationScope, seesAllLocations } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { fmtMoney } from "@/lib/domain";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export async function isAiConfigured(): Promise<boolean> {
  return !!process.env.ANTHROPIC_API_KEY;
}

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

async function askClaude(system: string, user: string, maxTokens = 2048): Promise<string> {
  const anthropic = client();
  if (!anthropic) throw new Error("AI is not configured");
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = response.content.filter(b => b.type === "text").map(b => (b.type === "text" ? b.text : "")).join("");
    if (response.stop_reason === "refusal" || !text) throw new Error("The AI declined to answer this request.");
    return text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("AI key is invalid — check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("AI is rate-limited right now — try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new Error(`AI error: ${e.message}`);
    throw e;
  }
}

const SYSTEM = `You are Rhino Brain, the AI assistant inside a B2B tire/wheel wholesale CRM used by Rhino Tire USA (Orlando, FL) and Everflow Tire (Dallas, TX).
Users are the owner, managers, and inside-sales reps. Customers are tire shops, car dealers, fleets and trailer manufacturers.
Be practical and concise. Money amounts are USD. When drafting outreach, sound like a helpful wholesale sales rep, never pushy or corporate.
Answer in the same language the user writes in (English or Chinese).`;

// ---------- 1. Priority follow-ups ----------

export type PriorityItem = {
  customerId: string;
  companyName: string;
  reason: string;
  metric: string;
  tip: string;
};

export async function getPriorityFollowUps(): Promise<{ items: PriorityItem[]; aiUsed: boolean; error?: string }> {
  const session = await requireSession();
  const scope = { ...repScope(session), ...locationScope(session) };
  const now = new Date();

  const [overdueFu, coolingA, bigDebtors] = await Promise.all([
    db.customer.findMany({
      where: { ...scope, status: "ACTIVE", nextFollowUpAt: { lt: now } },
      orderBy: { nextFollowUpAt: "asc" }, take: 6,
      select: { id: true, companyName: true, nextFollowUpAt: true, tier: true },
    }),
    db.customer.findMany({
      where: { ...scope, status: "ACTIVE", tier: { in: ["A", "B"] }, lastContactAt: { lt: subDays(now, 14) } },
      orderBy: { lastContactAt: "asc" }, take: 6,
      select: { id: true, companyName: true, lastContactAt: true, tier: true },
    }),
    db.invoice.findMany({
      where: {
        balance: { gt: 500 }, dueDate: { lt: subDays(now, 30) },
        ...(session.role === "SALES_REP" ? { customer: { assignedRepId: session.userId } } : {}),
      },
      orderBy: { balance: "desc" }, take: 6,
      include: { customer: { select: { id: true, companyName: true } } },
    }),
  ]);

  const items: PriorityItem[] = [];
  const seen = new Set<string>();
  for (const c of overdueFu) {
    if (seen.has(c.id)) continue; seen.add(c.id);
    items.push({
      customerId: c.id, companyName: c.companyName,
      reason: "Follow-up overdue",
      metric: `was due ${c.nextFollowUpAt?.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
      tip: "You promised this customer a follow-up — call today before a competitor does.",
    });
  }
  for (const c of coolingA) {
    if (seen.has(c.id)) continue; seen.add(c.id);
    const days = c.lastContactAt ? Math.floor((now.getTime() - c.lastContactAt.getTime()) / 86400000) : null;
    items.push({
      customerId: c.id, companyName: c.companyName,
      reason: `Tier ${c.tier} going quiet`,
      metric: days !== null ? `${days} days since last contact` : "never contacted",
      tip: "High-value account cooling off — check in with a stock update or a size they buy often.",
    });
  }
  for (const inv of bigDebtors) {
    if (!inv.customer || seen.has(inv.customer.id)) continue; seen.add(inv.customer.id);
    const daysOver = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
    items.push({
      customerId: inv.customer.id, companyName: inv.customer.companyName,
      reason: "Large overdue balance",
      metric: `${fmtMoney(Number(inv.balance))} · ${daysOver}d past due`,
      tip: "Call about the balance politely — offer a payment plan before it ages further.",
    });
  }
  const top = items.slice(0, 12);

  // With an API key, let Claude sharpen the one-line coaching tips
  if (process.env.ANTHROPIC_API_KEY && top.length > 0) {
    try {
      const listText = top.map((x, i) => `${i + 1}. ${x.companyName} — ${x.reason} (${x.metric})`).join("\n");
      const raw = await askClaude(
        SYSTEM,
        `For each account below, write ONE short coaching line for the sales rep: why call now + how to open the call. Reply with exactly ${top.length} lines, numbered to match, no preamble.\n\n${listText}`,
        1500,
      );
      const lines = raw.split("\n").map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
      if (lines.length >= top.length) top.forEach((x, i) => { x.tip = lines[i]; });
      return { items: top, aiUsed: true };
    } catch (e) {
      return { items: top, aiUsed: false, error: e instanceof Error ? e.message : "AI unavailable" };
    }
  }
  return { items: top, aiUsed: false };
}

// ---------- 2. Message generator ----------

const SCENARIOS: Record<string, string> = {
  quote_follow_up: "Follow up on a quote we sent that they haven't answered",
  reactivation: "Re-activate a customer who hasn't ordered in a while",
  first_touch: "First introduction call/email to a new prospect",
  restock: "Suggest a restock based on what they usually buy",
  new_arrival: "Tell them an item they wanted is back in stock",
  payment_reminder: "Friendly reminder about an overdue balance",
};

export async function draftMessage(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; email?: string; sms?: string; error?: string }> {
  const session = await requireSession();
  if (!process.env.ANTHROPIC_API_KEY) return { error: "AI is not configured yet — ask the admin to add ANTHROPIC_API_KEY." };

  const customerId = String(formData.get("customerId") ?? "");
  const scenario = String(formData.get("scenario") ?? "first_touch");
  const extra = String(formData.get("extra") ?? "").trim();

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      activities: { orderBy: { occurredAt: "desc" }, take: 5, select: { type: true, subject: true, notes: true, occurredAt: true } },
      invoices: { where: { balance: { gt: 0 } }, select: { balance: true, dueDate: true } },
    },
  });
  if (!customer) return { error: "Pick a customer from the list first." };
  if (session.role === "SALES_REP" && customer.assignedRepId !== session.userId) return { error: "Not your customer." };

  const owed = customer.invoices.reduce((s, i) => s + Number(i.balance), 0);
  const context = [
    `Customer: ${customer.companyName}${customer.contactPerson ? ` (contact: ${customer.contactPerson})` : ""}`,
    `Type: ${customer.type} · Tier ${customer.tier} · Interested in: ${customer.mainInterest}`,
    customer.city ? `Location: ${customer.city}, ${customer.state ?? ""}` : null,
    customer.paymentTerms ? `Payment terms: ${customer.paymentTerms}` : null,
    owed > 0 ? `Open balance: ${fmtMoney(owed)}` : null,
    customer.lastContactAt ? `Last contact: ${customer.lastContactAt.toISOString().slice(0, 10)}` : "Never contacted",
    customer.activities.length ? `Recent activity: ${customer.activities.map(a => `[${a.occurredAt.toISOString().slice(0, 10)}] ${a.type}: ${a.subject}`).join("; ")}` : null,
    extra ? `Extra context from the rep: ${extra}` : null,
  ].filter(Boolean).join("\n");

  try {
    const raw = await askClaude(
      SYSTEM,
      `Task: ${SCENARIOS[scenario] ?? scenario}.\nSign as ${session.name}, Rhino Tire USA.\n\n${context}\n\nWrite two versions:\n1. A short email (subject line + body, under 120 words)\n2. A text/WhatsApp message (under 40 words)\n\nFormat your reply EXACTLY as:\nEMAIL:\n<email here>\nSMS:\n<sms here>`,
      1200,
    );
    const emailMatch = raw.match(/EMAIL:\s*([\s\S]*?)\nSMS:/);
    const smsMatch = raw.match(/SMS:\s*([\s\S]*)$/);
    return { ok: true, email: emailMatch?.[1]?.trim() ?? raw, sms: smsMatch?.[1]?.trim() ?? "" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI request failed" };
  }
}

// ---------- 3. Ask box ----------

export async function askBrain(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; answer?: string; error?: string }> {
  const session = await requireSession();
  if (!process.env.ANTHROPIC_API_KEY) return { error: "AI is not configured yet — ask the admin to add ANTHROPIC_API_KEY." };
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: "Type a question first." };

  const scope = { ...repScope(session), ...locationScope(session) };
  // A/R must be scoped too: reps see only their customers' invoices, managers only their location.
  const invScope: Prisma.InvoiceWhereInput = {};
  if (session.role === "SALES_REP") invScope.customer = { assignedRepId: session.userId };
  else if (!seesAllLocations(session) && session.locationId) invScope.locationId = session.locationId;
  const now = new Date();
  const [customerCount, byTier, silent30, arAgg, lost30, topDebtors] = await Promise.all([
    db.customer.count({ where: scope }),
    db.customer.groupBy({ by: ["tier"], where: scope, _count: true }),
    db.customer.count({ where: { ...scope, lastContactAt: { lt: subDays(now, 30) } } }),
    db.invoice.aggregate({
      where: { balance: { gt: 0 }, ...invScope },
      _sum: { balance: true }, _count: true,
    }),
    db.lostSale.aggregate({ where: { occurredAt: { gte: subDays(now, 30) }, ...repScope(session, "repId") }, _sum: { estValue: true }, _count: true }),
    db.invoice.findMany({
      where: { balance: { gt: 0 }, dueDate: { lt: now }, ...invScope },
      orderBy: { balance: "desc" }, take: 10,
      select: { customerName: true, balance: true, dueDate: true },
    }),
  ]);

  const context = [
    `Today: ${now.toISOString().slice(0, 10)}. User: ${session.name} (${session.role}).`,
    `Customers in view: ${customerCount} (${byTier.map(t => `Tier ${t.tier}: ${t._count}`).join(", ")})`,
    `Customers silent 30+ days: ${silent30}`,
    `Open A/R: ${fmtMoney(Number(arAgg._sum.balance ?? 0))} across ${arAgg._count} invoices`,
    `Lost sales last 30d: ${lost30._count} events, ${fmtMoney(Number(lost30._sum.estValue ?? 0))}`,
    `Top overdue balances: ${topDebtors.map(d => `${d.customerName} ${fmtMoney(Number(d.balance))} (due ${d.dueDate.toISOString().slice(0, 10)})`).join("; ") || "none"}`,
  ].join("\n");

  try {
    const answer = await askClaude(
      SYSTEM,
      `Business snapshot:\n${context}\n\nQuestion from ${session.name}: ${question}\n\nAnswer using the snapshot above. If the snapshot doesn't contain what's needed, say what page of the CRM has it (Customers, A/R Aging, Lost Sales, Rep Performance, Products).`,
      1500,
    );
    return { ok: true, answer };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI request failed" };
  }
}
