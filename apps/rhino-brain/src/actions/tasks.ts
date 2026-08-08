"use server";

import { revalidatePath } from "next/cache";
import { isSameDay } from "date-fns";
import { db } from "@/lib/db";
import { requireSession, isManager, defaultLocationId, canWrite } from "@/lib/auth";
import { taskSchema } from "@/lib/validations";
import type { ActionResult } from "./auth";

export async function createTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const d = parsed.data;
  // Reps can only create tasks for themselves; managers can assign anyone.
  const assigneeId = isManager(session) ? d.assigneeId : session.userId;

    let locId: string | null = null;
  if (d.customerId) locId = (await db.customer.findUnique({ where: { id: d.customerId }, select: { locationId: true } }))?.locationId ?? null;
  if (!locId && assigneeId) locId = (await db.user.findUnique({ where: { id: assigneeId }, select: { locationId: true } }))?.locationId ?? null;
  if (!locId) locId = defaultLocationId(session, null);

  const task = await db.task.create({
    data: {
      locationId: locId, ...d, assigneeId, creatorId: session.userId, customerId: d.customerId || null },
  });

  if (assigneeId !== session.userId) {
    await db.notification.create({
      data: {
        type: isSameDay(task.dueDate, new Date()) ? "TASK_DUE" : "TASK_DUE",
        title: `New task: ${task.title}`,
        body: `Due ${task.dueDate.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
        link: "/tasks",
        userId: assigneeId,
      },
    });
  }
  revalidatePath("/tasks");
  revalidatePath("/my-work");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function completeTask(taskId: string): Promise<ActionResult> {
  const session = await requireSession();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found." };
  if (!isManager(session) && task.assigneeId !== session.userId)
    return { ok: false, error: "Not your task." };

  await db.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: new Date() } });
  revalidatePath("/tasks");
  revalidatePath("/my-work");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function cancelTask(taskId: string): Promise<ActionResult> {
  const session = await requireSession();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found." };
  if (!isManager(session) && task.creatorId !== session.userId)
    return { ok: false, error: "Only the creator or a manager can cancel a task." };

  await db.task.update({ where: { id: taskId }, data: { status: "CANCELED" } });
  revalidatePath("/tasks");
  revalidatePath("/my-work");
  return { ok: true };
}

export async function reopenTask(taskId: string): Promise<ActionResult> {
  const session = await requireSession();
  const task = await db.task.findUnique({ where: { id: taskId }, select: { locationId: true, assigneeId: true } });
  if (!task) return { ok: false, error: "Task not found." };
  if (!canWrite(session, { locationId: task.locationId, ownerId: task.assigneeId })) return { ok: false, error: "Not your task." };
  await db.task.update({ where: { id: taskId }, data: { status: "OPEN", completedAt: null } });
  revalidatePath("/tasks");
  return { ok: true };
}
