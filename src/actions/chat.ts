"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export type ChatMsg = { id: string; body: string; authorId: string; authorName: string; createdAt: string };

export async function fetchChatMessages(): Promise<ChatMsg[]> {
  await requireSession();
  const rows = await db.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true } } },
  });
  return rows.reverse().map(m => ({
    id: m.id, body: m.body, authorId: m.userId, authorName: m.user.name, createdAt: m.createdAt.toISOString(),
  }));
}

export async function sendChatMessage(body: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  const text = body.trim();
  if (!text) return { error: "Empty message" };
  if (text.length > 2000) return { error: "Message too long" };

  await db.chatMessage.create({ data: { userId: session.userId, body: text } });

  // @mention → notification. Matches "@FirstName", "@Full Name", or "@all".
  const mentioned = new Set<string>();
  const lower = text.toLowerCase();
  if (/@all\b/.test(lower)) {
    const all = await db.user.findMany({ where: { active: true, id: { not: session.userId } }, select: { id: true } });
    all.forEach(u => mentioned.add(u.id));
  } else if (text.includes("@")) {
    const users = await db.user.findMany({ where: { active: true, id: { not: session.userId } }, select: { id: true, name: true } });
    for (const u of users) {
      const first = u.name.split(/\s+/)[0].toLowerCase();
      if (lower.includes(`@${u.name.toLowerCase()}`) || lower.includes(`@${first}`)) mentioned.add(u.id);
    }
  }
  if (mentioned.size > 0) {
    await db.notification.createMany({
      data: [...mentioned].map(userId => ({
        userId, type: "CHAT_MENTION" as const,
        title: `${session.name} mentioned you in Team Chat`,
        body: text.slice(0, 120),
        link: "/chat",
      })),
    });
  }
  return { ok: true };
}
