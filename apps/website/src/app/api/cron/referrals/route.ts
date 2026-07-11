import { NextResponse } from "next/server";
import { runReferralMaintenance } from "@rhino/services";

export const dynamic = "force-dynamic";

/** Daily referral maintenance — wired to Vercel Cron (vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReferralMaintenance();
  return NextResponse.json(result);
}
