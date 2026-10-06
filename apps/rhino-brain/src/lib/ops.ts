// Shared (server + client) operations-module constants.

export const OPS_CATEGORIES: Record<string, { label: string; icon: string }> = {
  VEHICLE_INSURANCE: { label: "Vehicle insurance", icon: "🚚" },
  VEHICLE_REGISTRATION: { label: "Vehicle registration / tag", icon: "🪪" },
  WORKERS_COMP: { label: "Workers' comp", icon: "🦺" },
  LICENSE: { label: "Business license / permit", icon: "📜" },
  INSPECTION: { label: "Inspection (fire, forklift…)", icon: "🧯" },
  EQUIPMENT: { label: "Equipment service", icon: "⚙️" },
  OTHER: { label: "Other", icon: "📌" },
};

export const daysUntil = (d: Date | string, from = new Date()): number =>
  Math.ceil((new Date(d).getTime() - from.getTime()) / 86400000);
