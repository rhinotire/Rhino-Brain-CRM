import { db } from "@rhino/database";

/**
 * In-app notification for a company's managers + a follow-up task.
 * Shared by all public consumer flows — email is additive on top of this,
 * so a mail outage can never lose a lead.
 */
export async function notifyCrm(params: {
  locationId: string;
  title: string;
  body: string;
  link: string;
  assignedRepId?: string | null;
  taskPriority?: "HIGH" | "URGENT";
}): Promise<void> {
  const managers = await db.user.findMany({
    where: { active: true, role: { in: ["MANAGER", "ADMIN"] }, OR: [{ locationId: params.locationId }, { locationId: null }] },
    select: { id: true },
  });
  await db.notification.createMany({
    data: managers.map((m) => ({ userId: m.id, type: "LEAD_ASSIGNED" as const, title: params.title, body: params.body, link: params.link })),
  });
  const assignee = params.assignedRepId ?? managers[0]?.id;
  if (assignee) {
    await db.task.create({
      data: {
        title: params.title,
        description: `${params.body}\nOpen: ${params.link}`,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        priority: params.taskPriority ?? "HIGH",
        type: "FOLLOW_UP",
        assigneeId: assignee,
        creatorId: managers[0]?.id ?? assignee,
        locationId: params.locationId,
      },
    });
  }
}
