// Shared (server + client) module-permission registry.
// Role gives the defaults; per-user overrides are stored as "+key" / "-key".

export const PERMISSIONS = [
  { key: "ar", label: "A/R & Collections", roles: ["ADMIN", "MANAGER", "ACCOUNTING", "SALES_REP"] },
  { key: "activities", label: "Activities — team activity log", roles: ["ADMIN", "MANAGER", "SALES_REP", "ACCOUNTING"] },
  { key: "hr", label: "HR — employees & documents", roles: ["ADMIN", "MANAGER"] },
  { key: "reports", label: "Reports — rep performance & customers", roles: ["ADMIN", "MANAGER"] },
  { key: "freight", label: "Freight quoting", roles: ["ADMIN", "MANAGER"] },
  { key: "phone", label: "Phone & text messaging", roles: ["ADMIN", "MANAGER", "SALES_REP"] },
  { key: "import_export", label: "Data import / export", roles: ["ADMIN", "MANAGER"] },
  { key: "products", label: "Products & stock", roles: ["ADMIN", "MANAGER", "SALES_REP", "ACCOUNTING"] },
] as const;

export type PermKey = (typeof PERMISSIONS)[number]["key"];

export function roleDefault(role: string, key: PermKey): boolean {
  const def = PERMISSIONS.find(p => p.key === key);
  return !!def && (def.roles as readonly string[]).includes(role);
}

/** Effective permission for a user-like object (role + stored overrides). */
export function effectivePerm(u: { role: string; permissions?: string[] | null }, key: PermKey): boolean {
  const perms = u.permissions ?? [];
  if (perms.includes(`-${key}`)) return false;
  if (perms.includes(`+${key}`)) return true;
  return roleDefault(u.role, key);
}

/** Convert a checked-keys list back into minimal overrides vs the role defaults. */
export function overridesFromChecked(role: string, checked: string[]): string[] {
  const out: string[] = [];
  for (const p of PERMISSIONS) {
    const isChecked = checked.includes(p.key);
    const isDefault = roleDefault(role, p.key);
    if (isChecked && !isDefault) out.push(`+${p.key}`);
    if (!isChecked && isDefault) out.push(`-${p.key}`);
  }
  return out;
}
