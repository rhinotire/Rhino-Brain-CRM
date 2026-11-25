import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting } from "@/lib/auth";
import { companyFor } from "@/actions/competitor-lookup";
import { isTwilioConfigured } from "@/lib/twilio";
import { hasPerm } from "@/lib/auth";
import { StatCard } from "@/components/ui/primitives";
import { BlitzList, type BlitzRow } from "@/components/blitz-list";
import { contactsFromMeta } from "@/components/contact-chips";

export const dynamic = "force-dynamic";

/**
 * Prospecting Blitz (owner request 2026-11-25): a focused call list of the
 * near-warehouse tire-shop prospects assigned to a rep, worked top-down with
 * one-tap dial + AI opener + log-call. Managers get a progress header and can
 * switch reps to track the push (e.g. Edward's Dallas list).
 */
export default async function BlitzPage({ searchParams }: { searchParams: { rep?: string } }) {
  const session = await requireSession();
  if (isAccounting(session)) redirect("/ar");
  const manager = isManager(session);
  const company = await companyFor(session);
  const loc = await db.location.findFirst({ where: { shortTag: company === "EVERFLOW" ? "TX" : "FL" }, select: { id: true } });
  const locId = loc?.id ?? "";

  const reps = manager
    ? await db.user.findMany({ where: { active: true, locationId: locId, role: { in: ["SALES_REP", "MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const repId = manager ? (reps.some(r => r.id === searchParams.rep) ? searchParams.rep! : (reps[0]?.id ?? session.userId)) : session.userId;

  const where: Prisma.LeadWhereInput = { source: "PROSPECTING", locationId: locId, assignedRepId: repId, stage: { in: ["NEW_LEAD", "CONTACTED"] } };
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const [leads, total, remaining, callsThisWeek] = await Promise.all([
    db.lead.findMany({ where, orderBy: { companyName: "asc" }, take: 400, select: { id: true, companyName: true, city: true, state: true, phone: true, stage: true, meta: true } }),
    db.lead.count({ where: { source: "PROSPECTING", locationId: locId, assignedRepId: repId } }),
    db.lead.count({ where: { source: "PROSPECTING", locationId: locId, assignedRepId: repId, stage: "NEW_LEAD" } }),
    db.activity.count({ where: { repId, occurredAt: { gte: weekAgo }, type: { in: ["CALL", "NO_ANSWER", "VOICEMAIL"] }, lead: { source: "PROSPECTING" } } }),
  ]);

  const rows: BlitzRow[] = leads.map(l => {
    const meta = (l.meta ?? {}) as { website?: string };
    return {
      id: l.id, companyName: l.companyName, city: l.city, state: l.state, phone: l.phone,
      website: typeof meta.website === "string" ? meta.website : null,
      worked: l.stage !== "NEW_LEAD", contacts: contactsFromMeta(l.meta),
    };
  }).sort((a, b) => Number(a.worked) - Number(b.worked) || a.companyName.localeCompare(b.companyName));

  const phoneEnabled = isTwilioConfigured() && hasPerm(session, "phone");
  const repName = reps.find(r => r.id === repId)?.name ?? session.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🎯 Prospecting Blitz <span className="text-sm font-normal text-slate-400">{manager ? `— ${repName}` : ""}</span></h1>
          <p className="text-sm text-slate-500">Work the list top to bottom — tap ☎ to call, 🧠 for an opener, then log the call. Worked ones drop to the bottom.</p>
        </div>
        {manager && (
          <form className="flex items-center gap-2">
            <select name="rep" defaultValue={repId} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button type="submit" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">View</button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Assigned to work" value={String(total)} />
        <StatCard label="Not yet called" value={String(remaining)} tone={remaining > 0 ? "warn" : "good"} />
        <StatCard label="Worked" value={String(total - remaining)} tone="good" />
        <StatCard label="Calls this week" value={String(callsThisWeek)} tone={callsThisWeek > 0 ? "good" : "default"} />
      </div>

      <BlitzList rows={rows} phoneEnabled={phoneEnabled} />
    </div>
  );
}
