// Shared between the public onboarding form (client) and its server action.

/** ABA routing number checksum — catches any single mistyped digit. */
export function isValidRoutingNumber(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split("").map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

export type OnboardingData = {
  legalName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ecName: string;
  ecRelation: string;
  ecPhone: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: "checking" | "savings";
  signature: string;
  signedAt: string;
};
