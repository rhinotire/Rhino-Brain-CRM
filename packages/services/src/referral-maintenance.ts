import { db } from "@rhino/database";
import { recordEvent } from "./analytics";
import { notifyCrm } from "./crm-notify";

const ESCALATE_AFTER_DAYS = 3;

/**
 * Daily maintenance (cron): expire stale referrals, escalate unanswered ones
 * to MANUAL_ASSISTANCE_REQUIRED with a sales task (spec §18 response timer).
 */
export async function runReferralMaintenance(): Promise<{ expired: number; escalated: number }> {
  const now = new Date();
  const openStatuses = ["PENDING", "CONTACTED", "OPENED"] as const;

  // 1) Expire past-deadline referrals
  const toExpire = await db.installerReferral.findMany({
    where: { expiresAt: { lt: now }, status: { in: [...openStatuses] } },
    select: { id: true, consumerLeadId: true, consumerLead: { select: { status: true } } },
  });
  for (const r of toExpire) {
    await db.installerReferral.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "EXPIRED" } });
    await db.referralStatusHistory.create({
      data: { consumerLeadId: r.consumerLeadId, fromStatus: r.consumerLead.status, toStatus: "EXPIRED", actor: "system", reason: "referral window elapsed" },
    });
    await recordEvent("referral_expired", { consumerLeadId: r.consumerLeadId });
  }

  // 2) Escalate referrals with no installer response after N days
  const staleBefore = new Date(now.getTime() - ESCALATE_AFTER_DAYS * 864e5);
  const toEscalate = await db.installerReferral.findMany({
    where: {
      createdAt: { lt: staleBefore },
      expiresAt: { gt: now },
      status: { in: [...openStatuses] },
      consumerLead: { status: { not: "MANUAL_ASSISTANCE_REQUIRED" } },
    },
    select: {
      id: true, rawName: true, consumerLeadId: true,
      consumerLead: { select: { status: true, locationId: true, assignedRepId: true, zip: true, quantity: true, tireSize: true } },
    },
  });
  for (const r of toEscalate) {
    await db.consumerLead.update({ where: { id: r.consumerLeadId }, data: { status: "MANUAL_ASSISTANCE_REQUIRED" } });
    await db.referralStatusHistory.create({
      data: { consumerLeadId: r.consumerLeadId, fromStatus: r.consumerLead.status, toStatus: "MANUAL_ASSISTANCE_REQUIRED", actor: "system", reason: `no installer response in ${ESCALATE_AFTER_DAYS} days` },
    });
    if (r.consumerLead.locationId) {
      await notifyCrm({
        locationId: r.consumerLead.locationId,
        title: `No response from ${r.rawName ?? "installer"} — consumer waiting`,
        body: `Referral for ${r.consumerLead.quantity}x ${r.consumerLead.tireSize ?? "tires"} (consumer ZIP ${r.consumerLead.zip}) has had no installer response in ${ESCALATE_AFTER_DAYS} days. Call the shop or offer the consumer another option.`,
        link: `/consumer-leads?focus=${r.consumerLeadId}`,
        assignedRepId: r.consumerLead.assignedRepId,
        taskPriority: "URGENT",
      });
    }
  }

  return { expired: toExpire.length, escalated: toEscalate.length };
}
