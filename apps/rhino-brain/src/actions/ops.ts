"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, hasPerm, defaultLocationId, type Session } from "@/lib/auth";
import { uploadChatImage } from "@/lib/storage";
import type { ActionResult } from "./auth";

/** Ops is permission-gated, not role-gated — the GM may be any role. */
function opsInScope(session: Session, locationId: string): boolean {
  if (session.role === "ADMIN") return true;
  return session.locationId === locationId;
}

function monthsLater(d: Date, months: number): Date {
  const n = new Date(d);
  n.setMonth(n.getMonth() + months);
  return n;
}

/** Create or update a renewal/expiry item. Managers: own location only. */
export async function upsertOpsItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const category = String(formData.get("category") ?? "OTHER").slice(0, 30);
  const asset = String(formData.get("asset") ?? "").trim().slice(0, 120) || null;
  const dueRaw = String(formData.get("dueDate") ?? "");
  const rec = Number(formData.get("recurrenceMonths"));
  const remindDays = Math.min(Math.max(Number(formData.get("remindDays")) || 30, 1), 180);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;
  if (name.length < 2) return { ok: false, error: "Give it a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) return { ok: false, error: "Pick the due date." };

  const data = {
    name, category, asset,
    dueDate: new Date(dueRaw + "T12:00:00Z"),
    recurrenceMonths: Number.isFinite(rec) && rec > 0 ? Math.min(rec, 120) : null,
    remindDays, notes,
  };

  if (id) {
    const item = await db.opsItem.findUnique({ where: { id }, select: { locationId: true } });
    if (!item) return { ok: false, error: "Item not found." };
    if (!opsInScope(session, item.locationId)) return { ok: false, error: "Not your company's item." };
    await db.opsItem.update({ where: { id }, data });
  } else {
    const locationId = defaultLocationId(session, null);
    if (!locationId) return { ok: false, error: "Select a company in the sidebar first." };
    await db.opsItem.create({ data: { ...data, locationId } });
  }
  revalidatePath("/ops");
  return { ok: true };
}

/** Mark renewed: recurring items roll to the next cycle, one-time items close. */
export async function renewOpsItem(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const item = await db.opsItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "Item not found." };
  if (!opsInScope(session, item.locationId)) return { ok: false, error: "Not your company's item." };

  if (item.recurrenceMonths) {
    // roll from the due date (not today) so cycles stay anchored
    await db.opsItem.update({
      where: { id },
      data: { dueDate: monthsLater(item.dueDate, item.recurrenceMonths), lastRenewedAt: new Date(), lastRemindedOn: null },
    });
  } else {
    await db.opsItem.update({ where: { id }, data: { status: "DONE", lastRenewedAt: new Date() } });
  }
  revalidatePath("/ops");
  return { ok: true };
}

export async function deleteOpsItem(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const item = await db.opsItem.findUnique({ where: { id }, select: { locationId: true } });
  if (!item) return { ok: false, error: "Item not found." };
  if (!opsInScope(session, item.locationId)) return { ok: false, error: "Not your company's item." };
  await db.opsItem.delete({ where: { id } });
  revalidatePath("/ops");
  return { ok: true };
}

/** Anyone in the company can report a problem (photo optional). */
export async function createRepairTicket(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const details = String(formData.get("details") ?? "").trim().slice(0, 1000) || null;
  const priority = ["LOW", "NORMAL", "URGENT"].includes(String(formData.get("priority"))) ? String(formData.get("priority")) : "NORMAL";
  if (title.length < 3) return { ok: false, error: "Describe what's broken." };
  const locationId = defaultLocationId(session, null);
  if (!locationId) return { ok: false, error: "Select a company in the sidebar first." };

  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) return { ok: false, error: "Photo must be an image." };
    if (photo.size > 8 * 1024 * 1024) return { ok: false, error: "Photo too large (max 8 MB)." };
    photoPath = `repairs/${locationId}/${Date.now()}.jpg`;
    await uploadChatImage(photoPath, await photo.arrayBuffer(), photo.type).catch(() => { photoPath = null; });
  }

  await db.repairTicket.create({
    data: { title, details, priority, photoPath, reportedById: session.userId, locationId },
  });

  // ping the ops managers of that location so nothing sits unseen
  const managers = await db.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "MANAGER"] }, OR: [{ locationId }, { locationId: null }] },
    select: { id: true },
  });
  await Promise.all(managers.map(m =>
    db.notification.create({
      data: { type: "TASK_DUE", title: `🔧 Repair reported: ${title.slice(0, 60)}`, body: details?.slice(0, 120), link: "/ops", userId: m.id },
    }).catch(() => null),
  ));
  revalidatePath("/ops");
  return { ok: true };
}

export async function setRepairStatus(id: string, status: "OPEN" | "IN_PROGRESS" | "DONE", assignee?: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const t = await db.repairTicket.findUnique({ where: { id }, select: { locationId: true } });
  if (!t) return { ok: false, error: "Ticket not found." };
  if (!opsInScope(session, t.locationId)) return { ok: false, error: "Not your company's ticket." };
  await db.repairTicket.update({
    where: { id },
    data: {
      status,
      assignee: assignee !== undefined ? assignee.trim().slice(0, 80) || null : undefined,
      closedAt: status === "DONE" ? new Date() : null,
    },
  });
  revalidatePath("/ops");
  return { ok: true };
}
