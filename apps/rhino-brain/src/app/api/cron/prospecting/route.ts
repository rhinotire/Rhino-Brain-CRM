import { NextResponse } from "next/server";
import { runProspectingPipeline, type ProspectArea, type ProspectCategory, type PipelineResult } from "@rhino/services";

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

  const category = ROTATION[Math.floor(Date.now() / 86400000) % ROTATION.length];
  const out: { category: ProspectCategory; areas: Record<string, PipelineResult | { error: string }> } = { category, areas: {} };
  for (const area of ["RHINO", "EVERFLOW"] as ProspectArea[]) {
    try {
      out.areas[area] = await runProspectingPipeline({ area, category, limit: LIMIT_PER_AREA, placesKey, log: () => {} });
    } catch (e) {
      out.areas[area] = { error: e instanceof Error ? e.message : "collection failed" };
    }
  }
  return NextResponse.json(out);
}
