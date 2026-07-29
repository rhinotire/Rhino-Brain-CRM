"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession, isManager, defaultLocationId, locationScope } from "@/lib/auth";
import type { ActionResult } from "./auth";
import type { InstallerPreferredStatus } from "@prisma/client";

const installerSchema = z.object({
  storeName: z.string().trim().min(2, "Store name is required"),
  legalName: z.string().trim().optional(),
  phone: z.string().trim().min(7, "Phone is required"),
  email: z.string().trim().email().optional().or(z.literal("")),
  notifyEmail: z.string().trim().email().optional().or(z.literal("")),
  website: z.string().trim().optional(),
  address: z.string().trim().min(3, "Street address is required"),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().min(2, "State is required").max(20),
  zip: z.string().trim().regex(/^\d{5}$/, "ZIP must be 5 digits"),
  serviceRadiusMi: z.coerce.number().int().min(5).max(200).default(35),
  preferredStatus: z.enum(["OWNED", "PREFERRED", "PARTNER", "PROSPECT"]).default("PARTNER"),
  locationId: z.string().optional(),
  customerId: z.string().optional(),
});

const CAPABILITIES = ["passenger", "lightTruck", "trailer", "tbr", "wheels", "mobileService"] as const;

function parseForm(formData: FormData) {
  const entries = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = installerSchema.safeParse(entries);
  if (!parsed.success) return { error: parsed.error.errors[0].message } as const;
  const caps = Object.fromEntries(CAPABILITIES.map((c) => [c, formData.get(`cap_${c}`) === "on"]));
  return {
    data: {
      ...parsed.data,
      legalName: parsed.data.legalName || null,
      email: parsed.data.email || null,
      notifyEmail: parsed.data.notifyEmail || null,
      website: parsed.data.website || null,
      customerId: parsed.data.customerId || null,
      ...caps,
      appointmentEnabled: formData.get("appointmentEnabled") === "on",
      sameDayEnabled: formData.get("sameDayEnabled") === "on",
    },
  } as const;
}

export async function createInstaller(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can add installers." };
  const parsed = parseForm(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const { locationId: requestedLoc, preferredStatus, ...rest } = parsed.data;
  const locationId = defaultLocationId(session, requestedLoc);
  if (!locationId) return { ok: false, error: "Pick a company/location first (sidebar switcher)." };

  // one OWNED store per company keeps routing priority unambiguous
  if (preferredStatus === "OWNED") {
    const owned = await db.installer.findFirst({ where: { locationId, preferredStatus: "OWNED", active: true } });
    if (owned) return { ok: false, error: `${owned.storeName} is already the OWNED store — set it to Partner first.` };
  }

  await db.installer.create({
    data: { ...rest, preferredStatus: preferredStatus as InstallerPreferredStatus, locationId },
  });
  revalidatePath("/installers");
  redirect("/installers");
}

export async function updateInstaller(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can edit installers." };
  const existing = await db.installer.findFirst({ where: { id, ...locationScope(session) } });
  if (!existing) return { ok: false, error: "Installer not found." };

  const parsed = parseForm(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const { locationId: _ignored, preferredStatus, ...rest } = parsed.data;

  if (preferredStatus === "OWNED") {
    const owned = await db.installer.findFirst({
      where: { locationId: existing.locationId, preferredStatus: "OWNED", active: true, NOT: { id } },
    });
    if (owned) return { ok: false, error: `${owned.storeName} is already the OWNED store — set it to Partner first.` };
  }

  await db.installer.update({
    where: { id },
    data: { ...rest, preferredStatus: preferredStatus as InstallerPreferredStatus },
  });
  revalidatePath("/installers");
  redirect("/installers");
}

export async function toggleInstallerActive(id: string): Promise<void> {
  const session = await requireSession();
  if (!isManager(session)) return;
  const existing = await db.installer.findFirst({ where: { id, ...locationScope(session) } });
  if (!existing) return;
  await db.installer.update({ where: { id }, data: { active: !existing.active } });
  revalidatePath("/installers");
}

export type CustomerCandidate = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

/** Search dealer customers (company-scoped) to convert into installers.
 * Empty query → most recent customers, so the picker works without typing. */
export async function searchInstallerCandidates(query: string): Promise<CustomerCandidate[]> {
  const session = await requireSession();
  if (!isManager(session)) return [];
  const q = query.trim();
  const rows = await db.customer.findMany({
    where: {
      ...locationScope(session),
      ...(q.length >= 2
        ? {
            OR: [
              { companyName: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true, companyName: true, contactPerson: true, phone: true, email: true,
      address: true, city: true, state: true, zip: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return rows;
}
