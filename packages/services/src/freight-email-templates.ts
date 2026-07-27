/**
 * Pure email builders for the freight quote tool (spec §4). No transport deps
 * so previews and tests need no mail config.
 */
export type FreightStopInfo = {
  sequence: number;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  contactName?: string | null;
  phone?: string | null;
  quantity?: string | null;
  notes?: string | null;
};

export type FreightEmailInput = {
  refCode: string;
  originAddress: string;
  originLabel: string;
  equipment: "DRY_VAN_53" | "FLATBED_53";
  pickupDateISO: string; // YYYY-MM-DD
  commodity: string;
  stops: FreightStopInfo[];
  notes?: string | null;
};

export function equipmentLabel(e: FreightEmailInput["equipment"]): string {
  return e === "DRY_VAN_53" ? "53' Dry Van" : "53' Flatbed";
}

export function routeSummary(input: FreightEmailInput): string {
  const stops = [...input.stops].sort((a, b) => a.sequence - b.sequence);
  const cities = stops.map((s) => `${s.city} ${s.state}`).join(" + ");
  const count = stops.length > 1 ? ` (${stops.length} stops)` : "";
  return `${input.originLabel} -> ${cities}${count}`;
}

function stopLines(input: FreightEmailInput): string {
  return [...input.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const lines = [
        `Stop ${s.sequence}: ${s.name}`,
        `  ${s.addressLine}, ${s.city}, ${s.state} ${s.zip}`,
      ];
      if (s.quantity) lines.push(`  Quantity: ${s.quantity}`);
      if (s.contactName || s.phone) lines.push(`  Contact: ${[s.contactName, s.phone].filter(Boolean).join(", ")}`);
      if (s.notes) lines.push(`  Notes: ${s.notes}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildQuoteRequestEmail(input: FreightEmailInput): { subject: string; body: string } {
  const subject = `Rate Request ${input.refCode}: ${routeSummary(input)}, ${equipmentLabel(input.equipment)}`;
  const multi = input.stops.length > 1;
  const body = [
    `Hello,`,
    ``,
    `We have a ${equipmentLabel(input.equipment)} load of ${input.commodity} and would like your best all-in rate${multi ? " (including all drop fees)" : ""}.`,
    ``,
    `Reference: ${input.refCode}`,
    `Pickup date: ${input.pickupDateISO}`,
    `Origin: ${input.originAddress}`,
    ``,
    `Delivery stops (in order):`,
    ``,
    stopLines(input),
    ``,
    ...(input.notes ? [`Notes: ${input.notes}`, ``] : []),
    `Please reply with your all-in rate, earliest pickup availability, and estimated transit time. Keep "${input.refCode}" in the subject line.`,
    ``,
    `Thank you,`,
    `Rhino Tire USA Logistics`,
  ].join("\n");
  return { subject, body };
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildConfirmationEmail(
  input: FreightEmailInput,
  award: { carrierName: string; contactName?: string | null; price: number }
): { subject: string; body: string } {
  const subject = `BOOKED ${input.refCode}: ${routeSummary(input)}, ${equipmentLabel(input.equipment)}`;
  const body = [
    `Hello${award.contactName ? ` ${award.contactName}` : ""},`,
    ``,
    `Confirming we would like to book this load with ${award.carrierName} at the agreed all-in rate of ${fmtUsd(award.price)}.`,
    ``,
    `Reference: ${input.refCode}`,
    `Pickup date: ${input.pickupDateISO}`,
    `Origin: ${input.originAddress}`,
    ``,
    `Delivery stops (in order):`,
    ``,
    stopLines(input),
    ``,
    `Please confirm receipt and send driver/dispatch details.`,
    ``,
    `Thank you,`,
    `Rhino Tire USA Logistics`,
  ].join("\n");
  return { subject, body };
}

export function buildRegretEmail(input: FreightEmailInput, carrierName: string): { subject: string; body: string } {
  return {
    subject: `Re: Rate Request ${input.refCode}`,
    body: [
      `Hello,`,
      ``,
      `Thank you for the quote on ${input.refCode}. This load has been covered. We appreciate the quick response and will keep ${carrierName} on our list for upcoming loads.`,
      ``,
      `Rhino Tire USA Logistics`,
    ].join("\n"),
  };
}
