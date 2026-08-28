import { NextResponse } from "next/server";
import { runReferralMaintenance } from "@rhino/services";

export const dynamic = "force-dynamic";

/** Daily referral maintenance — wired to Vercel Cron (vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Maintenance covers ALL brands in the shared DB, so only one deployment may
  // run it. The EVERFLOW Vercel project sets DISABLE_CRON=1; RHINO is the runner.
  if (process.env.DISABLE_CRON === "1") {
    return NextResponse.json({ skipped: "cron disabled on this deployment" });
  }
  const result = await runReferralMaintenance();
  return NextResponse.json(result);
}
