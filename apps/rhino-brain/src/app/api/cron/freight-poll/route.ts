import { NextResponse } from "next/server";
import { pollFreightInbox } from "@rhino/services";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // IMAP + per-message AI extraction

/** Vercel Cron entry (vercel.json). Manual equivalent: checkRepliesNow action. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await pollFreightInbox();
  return NextResponse.json(result);
}
