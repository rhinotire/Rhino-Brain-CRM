import { differenceInCalendarDays } from "date-fns";
import type {
  CustomerType, CustomerStatus, CustomerSource, ProductCategory, PipelineStage,
  LostReason, ActivityType, TaskPriority, TaskStatus, TaskType, QuoteStatus,
  Probability, OpportunityStatus, Role, Tier,
} from "@prisma/client";

// ---------- Display labels ----------

export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin / Owner",
  MANAGER: "Sales Manager",
  SALES_REP: "Sales Rep",
  ACCOUNTING: "Accounting",
};

export const customerTypeLabels: Record<CustomerType, string> = {
  TIRE_SHOP: "Tire Shop",
  CAR_DEALER: "Car Dealer",
  TRAILER_MANUFACTURER: "Trailer Manufacturer",
  FLEET: "Fleet",
  REPAIR_SHOP: "Repair Shop",
  WHOLESALE_DEALER: "Wholesale Dealer",
  ONLINE_BUYER: "Online Buyer",
  OTHER: "Other",
};

export const customerStatusLabels: Record<CustomerStatus, string> = {
  LEAD: "Lead",
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  LOST: "Lost",
  DO_NOT_CONTACT: "Do Not Contact",
};

export const customerSourceLabels: Record<CustomerSource, string> = {
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  EXISTING: "Existing",
  COLD_CALL: "Cold Call",
  WEBSITE: "Website",
  MARKETPLACE: "Marketplace",
  WEBSITE_QUOTE: "Website Quote",
  WEBSITE_DEALER_APP: "Dealer Application",
  AI_ASSISTANT: "AI Assistant",
  CONSUMER_REFERRAL: "Consumer Referral",
  OTHER: "Other",
};

export const productLabels: Record<ProductCategory, string> = {
  PCR_TIRES: "PCR Tires",
  LT_TIRES: "LT Tires",
  TBR_TIRES: "TBR Tires",
  TRAILER_TIRES: "Trailer Tires",
  WHEELS: "Wheels",
  TRAILER_PARTS: "Trailer Parts",
  OIL_LUBRICANTS: "Oil / Lubricants",
  OTHER: "Other",
};

export const stageLabels: Record<PipelineStage, string> = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  QUOTED: "Quoted",
  NEGOTIATING: "Negotiating",
  FIRST_ORDER: "First Order",
  ACTIVE_CUSTOMER: "Active Customer",
  LOST: "Lost",
};

export const stageOrder: PipelineStage[] = [
  "NEW_LEAD", "CONTACTED", "INTERESTED", "QUOTED", "NEGOTIATING", "FIRST_ORDER", "ACTIVE_CUSTOMER", "LOST",
];

export const lostReasonLabels: Record<LostReason, string> = {
  PRICE_TOO_HIGH: "Price too high",
  NO_RESPONSE: "No response",
  BOUGHT_FROM_COMPETITOR: "Bought from competitor",
  NO_CURRENT_DEMAND: "No current demand",
  BAD_CREDIT: "Bad credit",
  WRONG_CUSTOMER_TYPE: "Wrong customer type",
  OTHER: "Other",
};

export const activityTypeLabels: Record<ActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  TEXT: "Text",
  WHATSAPP: "WhatsApp",
  QUOTE: "Quote Sent",
  ORDER: "Order Discussion",
  PAYMENT: "Payment Follow-up",
  VISIT: "Customer Visit",
  COMPLAINT: "Complaint",
  INTERNAL_NOTE: "Internal Note",
  NO_ANSWER: "No Answer",
  VOICEMAIL: "Left Voicemail",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  OPEN: "Open", COMPLETED: "Completed", CANCELED: "Canceled",
};

export const taskTypeLabels: Record<TaskType, string> = {
  CALL: "Call", FOLLOW_UP: "Follow-up", QUOTE: "Quote", PAYMENT: "Payment",
  REACTIVATION: "Reactivation", COMPLAINT: "Complaint", OTHER: "Other",
};

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  FOLLOW_UP_NEEDED: "Follow-up Needed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export const probabilityLabels: Record<Probability, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High",
};

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  OPEN: "Open", WON: "Won", LOST: "Lost",
};

export const tierLabels: Record<Tier, string> = { A: "A", B: "B", C: "C", D: "D" };

// ---------- Business rules ----------

export type Temperature = "HOT" | "WARM" | "COOLING" | "INACTIVE" | "LOST" | "NEVER";

/**
 * Customer maintenance temperature, based on days since last contact:
 * Hot < 7d, Warm < 30d, Cooling 30–60d, Inactive 60–90d, Lost > 90d.
 */
export function customerTemperature(lastContactAt: Date | null | undefined, now = new Date()): Temperature {
  if (!lastContactAt) return "NEVER";
  const days = differenceInCalendarDays(now, lastContactAt);
  if (days < 7) return "HOT";
  if (days < 30) return "WARM";
  if (days < 60) return "COOLING";
  if (days < 90) return "INACTIVE";
  return "LOST";
}

export const temperatureLabels: Record<Temperature, string> = {
  HOT: "Hot",
  WARM: "Warm",
  COOLING: "Cooling",
  INACTIVE: "Inactive",
  LOST: "Lost (90d+)",
  NEVER: "Never Contacted",
};

export const temperatureClasses: Record<Temperature, string> = {
  HOT: "bg-emerald-100 text-emerald-800",
  WARM: "bg-lime-100 text-lime-800",
  COOLING: "bg-amber-100 text-amber-800",
  INACTIVE: "bg-orange-100 text-orange-800",
  LOST: "bg-red-100 text-red-800",
  NEVER: "bg-slate-100 text-slate-600",
};

/** Quote is "Follow-up Needed" when sent 3+ days ago with no follow-up logged. */
export function quoteNeedsFollowUp(q: {
  status: QuoteStatus; sentAt: Date | null; lastFollowUpAt: Date | null;
}, now = new Date()): boolean {
  if (q.status !== "SENT") return q.status === "FOLLOW_UP_NEEDED";
  if (!q.sentAt) return false;
  const anchor = q.lastFollowUpAt ?? q.sentAt;
  return differenceInCalendarDays(now, anchor) >= 3;
}

/** Lead sitting in NEW_LEAD 3+ days with no activity → "Needs First Contact". */
export function leadNeedsFirstContact(l: {
  stage: PipelineStage; createdAt: Date; lastActivityAt: Date | null;
}, now = new Date()): boolean {
  return l.stage === "NEW_LEAD" && !l.lastActivityAt && differenceInCalendarDays(now, l.createdAt) >= 3;
}

/** Simple customer score: tier + recency + engagement. Recomputed on activity log. */
export function computeCustomerScore(input: {
  tier: Tier; lastContactAt: Date | null; activityCount90d: number; acceptedQuotes: number;
}): number {
  const tierPoints = { A: 40, B: 30, C: 20, D: 10 }[input.tier];
  const temp = customerTemperature(input.lastContactAt);
  const recencyPoints = { HOT: 30, WARM: 22, COOLING: 12, INACTIVE: 6, LOST: 0, NEVER: 0 }[temp];
  const engagement = Math.min(20, input.activityCount90d * 2);
  const wins = Math.min(10, input.acceptedQuotes * 5);
  return tierPoints + recencyPoints + engagement + wins; // 0–100
}

// ---------- Formatting ----------

// All timestamps display in Eastern time (HQ: Orlando, FL) — the server itself runs in UTC.
export const BUSINESS_TZ = "America/New_York";

/** UTC instant when the Eastern-time clock reads midnight on the given ET calendar date (DST-aware). */
function etMidnightUTC(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 6, 0, 0)); // 06:00 UTC = 01:00/02:00 ET, always date d in ET
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(guess);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0) % 24;
  const min = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return new Date(guess.getTime() - (h * 60 + min) * 60000);
}

/**
 * Start of the Eastern-time day containing `at` (optionally snapped to the
 * ET week/month start) — report ranges use this so "Today" means today in
 * Orlando, not UTC, regardless of the server's own timezone.
 */
export function etDayStart(at = new Date(), opts: { toWeekStart?: boolean; toMonthStart?: boolean } = {}): Date {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = f.formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  // carry the ET calendar date in a UTC container for easy week/month arithmetic
  const cal = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  if (opts.toWeekStart) cal.setUTCDate(cal.getUTCDate() - cal.getUTCDay());
  if (opts.toMonthStart) cal.setUTCDate(1);
  return etMidnightUTC(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate());
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: BUSINESS_TZ });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TZ,
  });
}

export function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function daysSince(d: Date | null | undefined, now = new Date()): number | null {
  if (!d) return null;
  return differenceInCalendarDays(now, d);
}
