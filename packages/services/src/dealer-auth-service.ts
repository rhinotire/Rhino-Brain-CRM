import { db } from "@rhino/database";
import bcrypt from "bcryptjs";

/**
 * Dealer portal authentication (architecture.md trust tier: external dealer).
 * DealerUser is completely separate from the internal CRM User. A dealer login
 * belongs to exactly one Customer; the session carries that customer's id and
 * price tier so every downstream call is scoped server-side.
 */

export type DealerIdentity = {
  dealerUserId: string;
  customerId: string;
  /** person name on the login */
  name: string;
  companyName: string;
  tier: "A" | "B" | "C" | "D";
};

const normEmail = (e: string) => e.trim().toLowerCase();

export const DealerAuthService = {
  /** null on any failure — never reveals whether the email exists. */
  async authenticate(email: string, password: string): Promise<DealerIdentity | null> {
    const user = await db.dealerUser.findUnique({
      where: { email: normEmail(email) },
      include: { customer: { select: { id: true, companyName: true, tier: true } } },
    });
    if (!user || !user.active) return null;
    if (!(await bcrypt.compare(password, user.passwordHash))) return null;
    await db.dealerUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return {
      dealerUserId: user.id,
      customerId: user.customer.id,
      name: user.name,
      companyName: user.customer.companyName,
      tier: user.customer.tier,
    };
  },

  /** Admin/seed path — creates a login attached to an existing Customer. */
  async createDealerUser(input: { email: string; password: string; name: string; customerId: string }) {
    const passwordHash = await bcrypt.hash(input.password, 10);
    return db.dealerUser.create({
      data: { email: normEmail(input.email), passwordHash, name: input.name, customerId: input.customerId },
      select: { id: true, email: true, name: true, customerId: true },
    });
  },

  /** Re-check the login is still active (used at session-sensitive spots). */
  async getActive(dealerUserId: string) {
    return db.dealerUser.findFirst({ where: { id: dealerUserId, active: true } });
  },

  /** Self-service password change — requires the current password. */
  async changePassword(dealerUserId: string, currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (newPassword.length < 8) return { ok: false, error: "New password must be at least 8 characters." };
    const user = await db.dealerUser.findFirst({ where: { id: dealerUserId, active: true } });
    if (!user) return { ok: false, error: "Account not found." };
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return { ok: false, error: "Current password is incorrect." };
    await db.dealerUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    return { ok: true };
  },
};
