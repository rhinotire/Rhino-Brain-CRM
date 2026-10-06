import { NextResponse } from "next/server";
import { getSession, hasPerm } from "@/lib/auth";
import { isTwilioConfigured, mintVoiceToken } from "@/lib/twilio";

export const dynamic = "force-dynamic";

/** Browser Voice SDK token — staff session required (cookie accompanies the fetch). */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPerm(session, "phone")) return NextResponse.json({ error: "no phone permission" }, { status: 403 });
  if (!isTwilioConfigured()) return NextResponse.json({ error: "not configured" }, { status: 501 });
  return NextResponse.json({ token: mintVoiceToken(session.userId) });
}
