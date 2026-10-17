import { NextResponse } from "next/server";
import { runProspectingPipeline, findDecisionMakers, domainKey, type ProspectArea, type ProspectCategory, type PipelineResult } from "@rhino/services";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Places sweep + per-lead AI enrich/score

/**
 * Daily automated prospecting (vercel.json cron, Hobby = once a day): one
 * small Places sweep per warehouse — Orlando 50 mi (Rhino) and Dallas 50 mi
 * (Everflow). Category rotates daily with truck tires weighted double, the
 * owner's priority. New leads land in /prospecting and each rep's My Work.
 */
const ROTATION: ProspectCategory[] = ["p4", "p3", "p4", "p1"];
const LIMIT_PER_AREA = 12; // candidates per area per day — keeps Places + Claude spend small

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, { status: 500 });

  const started = new Date();
  const category = ROTATION[Math.floor(Date.now() / 86400000) % ROTATION.length];
  const out: {
    category: ProspectCategory;
    areas: Record<string, PipelineResult | { error: string }>;
    contacts?: { leadsEnriched: number; people: number };
  } = { category, areas: {} };
  for (const area of ["RHINO", "EVERFLOW"] as ProspectArea[]) {
    try {
      out.areas[area] = await runProspectingPipeline({ area, category, limit: LIMIT_PER_AREA, placesKey, log: () => {} });
    } catch (e) {
      out.areas[area] = { error: e instanceof Error ? e.message : "collection failed" };
    }
  }

  // Auto-dig decision-makers (owner/purchaser) for today's A/B-grade finds, so
  // reps open My Work to a named contact. Capped — Apollo credits are real money.
  const apolloKey = process.env.APOLLO_API_KEY;
  if (apolloKey) {
    let leadsEnriched = 0, people = 0;
    const fresh = await db.lead.findMany({
      where: { source: "PROSPECTING", createdAt: { gte: started }, pool: { in: ["A_BUYER", "B_PROJECT"] } },
      take: 6,
    });
    for (const lead of fresh) {
      const meta = (lead.meta ?? {}) as Record<string, unknown>;
      if (Array.isArray(meta.contacts) && meta.contacts.length > 0) continue;
      try {
        const domain = domainKey(typeof meta.website === "string" ? meta.website : null) || null;
        const { contacts } = await findDecisionMakers(
          { companyName: lead.companyName, domain },
          { apolloKey, rocketReachKey: process.env.ROCKETREACH_API_KEY }
        );
        if (contacts.length === 0) continue;
        await db.lead.update({
          where: { id: lead.id },
          data: {
            meta: { ...meta, contacts },
            ...(lead.contactPerson ? {} : { contactPerson: `${contacts[0].name} (${contacts[0].title})` }),
            ...(lead.email || !contacts[0].email ? {} : { email: contacts[0].email }),
          },
        });
        leadsEnriched++;
        people += contacts.length;
      } catch { /* one failed lookup never kills the run */ }
    }
    out.contacts = { leadsEnriched, people };
  }
  return NextResponse.json(out);
}
