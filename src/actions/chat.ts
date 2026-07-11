"use server";

import { db } from "@/lib/db";
import { requireSession, seesAllLocations, type Session } from "@/lib/auth";
import { uploadChatImage, chatImageUrl, isStorageConfigured } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

export type ChatMsg = { id: string; body: string; authorId: string; authorName: string; imageUrl: string | null; createdAt: string };
export type ChatPeer = { id: string; name: string };

/**
 * Who this user may chat with. Admins & accounting see everyone (cross-company);
 * reps/managers are limited to their own location, plus the owner (ADMIN) who bridges both companies.
 */
function peerScope(session: Session): Prisma.UserWhereInput {
  if (seesAllLocations(session)) return {};
  return { OR: [{ locationId: session.locationId ?? "__none__" }, { role: "ADMIN" }] };
}

/** Where-clause for a channel: team (peerId null) or the 1:1 thread between me and peer. */
function channelWhere(session: Session, peerId?: string): Prisma.ChatMessageWhereInput {
  if (!peerId) return { recipientId: null, user: peerScope(session) };
  return {
    OR: [
      { userId: session.userId, recipientId: peerId },
      { userId: peerId, recipientId: session.userId },
    ],
  };
}

export async function fetchChatMessages(peerId?: string): Promise<ChatMsg[]> {
  const session = await requireSession();
  const rows = await db.chatMessage.findMany({
    where: channelWhere(session, peerId),
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true } } },
  });
  return rows.reverse().map(m => ({
    id: m.id, body: m.body, authorId: m.userId, authorName: m.user.name,
    imageUrl: chatImageUrl(m.imagePath), createdAt: m.createdAt.toISOString(),
  }));
}

export async function listChatPeers(): Promise<ChatPeer[]> {
  const session = await requireSession();
  const users = await db.user.findMany({
    where: { active: true, id: { not: session.userId }, ...peerScope(session) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return users;
}

async function notifyMentions(session: Session, text: string, peerId?: string) {
  if (peerId) {
    // DM → always notify the recipient
    await db.notification.create({
      data: { userId: peerId, type: "CHAT_MENTION", title: `${session.name} messaged you`, body: text.slice(0, 120) || "📷 Photo", link: "/chat" },
    });
    return;
  }
  const mentioned = new Set<string>();
  const lower = text.toLowerCase();
  if (/@all\b/.test(lower)) {
    const all = await db.user.findMany({ where: { active: true, id: { not: session.userId }, ...peerScope(session) }, select: { id: true } });
    all.forEach(u => mentioned.add(u.id));
  } else if (text.includes("@")) {
    const users = await db.user.findMany({ where: { active: true, id: { not: session.userId }, ...peerScope(session) }, select: { id: true, name: true } });
    for (const u of users) {
      const first = u.name.split(/\s+/)[0].toLowerCase();
      if (lower.includes(`@${u.name.toLowerCase()}`) || lower.includes(`@${first}`)) mentioned.add(u.id);
    }
  }
  if (mentioned.size > 0) {
    await db.notification.createMany({
      data: [...mentioned].map(userId => ({
        userId, type: "CHAT_MENTION" as const, title: `${session.name} mentioned you in Team Chat`, body: text.slice(0, 120), link: "/chat",
      })),
    });
  }
}

/** A DM target must be someone this user is allowed to chat with (same company, or the owner). */
async function assertPeerAllowed(session: Session, peerId?: string | null): Promise<boolean> {
  if (!peerId) return true;
  const ok = await db.user.findFirst({ where: { id: peerId, active: true, ...peerScope(session) }, select: { id: true } });
  return !!ok;
}

export async function sendChatMessage(body: string, peerId?: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  const text = body.trim();
  if (!text) return { error: "Empty message" };
  if (text.length > 2000) return { error: "Message too long" };
  if (!(await assertPeerAllowed(session, peerId))) return { error: "You can't message that user." };
  await db.chatMessage.create({ data: { userId: session.userId, recipientId: peerId || null, body: text } });
  await notifyMentions(session, text, peerId);
  return { ok: true };
}

const IMG_MAX = 8 * 1024 * 1024;
const IMG_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];

export async function sendChatImage(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (!isStorageConfigured()) return { error: "Image sharing is not configured (SUPABASE keys missing)." };
  const file = formData.get("file");
  const peerId = String(formData.get("peerId") ?? "") || null;
  const caption = String(formData.get("caption") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > IMG_MAX) return { error: "Image too large (max 8 MB)." };
  if (!IMG_MIME.includes(file.type)) return { error: "Use a JPG, PNG, GIF, or WebP image." };
  if (!(await assertPeerAllowed(session, peerId))) return { error: "You can't message that user." };
  try {
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const path = `${session.userId}/${Date.now()}.${ext}`;
    await uploadChatImage(path, await file.arrayBuffer(), file.type);
    await db.chatMessage.create({ data: { userId: session.userId, recipientId: peerId, body: caption, imagePath: path } });
    await notifyMentions(session, caption || "📷 Photo", peerId ?? undefined);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}
