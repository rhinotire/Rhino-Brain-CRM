"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, hasPerm, defaultLocationId, type Session } from "@/lib/auth";
import { uploadChatImage } from "@/lib/storage";
import type { ActionResult } from "./auth";

function inScope(session: Session, locationId: string): boolean {
  if (session.role === "ADMIN") return true;
  return session.locationId === locationId;
}

async function scopedVehicle(session: Session, vehicleId: string) {
  const v = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, name: true, locationId: true } });
  if (!v || !inScope(session, v.locationId)) return null;
  return v;
}

export async function upsertVehicle(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const id = String(formData.get("id") ?? "");
  const g = (k: string, max = 120) => String(formData.get(k) ?? "").trim().slice(0, max) || null;
  const name = g("name");
  if (!name || name.length < 2) return { ok: false, error: "Give the vehicle a name." };
  const odoRaw = Number(String(formData.get("odometer") ?? "").replace(/\D/g, ""));
  const data = {
    name, plate: g("plate", 20), vin: g("vin", 30), makeModel: g("makeModel"),
    assignedTo: g("assignedTo", 80), notes: g("notes", 500),
    odometer: Number.isFinite(odoRaw) && odoRaw > 0 ? odoRaw : null,
    active: formData.get("active") !== "off",
  };
  if (id) {
    const v = await scopedVehicle(session, id);
    if (!v) return { ok: false, error: "Vehicle not found." };
    await db.vehicle.update({ where: { id }, data });
  } else {
    const locationId = defaultLocationId(session, null);
    if (!locationId) return { ok: false, error: "Select a company in the sidebar first." };
    await db.vehicle.create({ data: { ...data, locationId } });
  }
  revalidatePath("/fleet");
  return { ok: true };
}

export async function addMaintenance(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const v = await scopedVehicle(session, vehicleId);
  if (!v) return { ok: false, error: "Vehicle not found." };
  const dateRaw = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { ok: false, error: "Pick the date." };
  const type = ["OIL_CHANGE", "TIRES", "BRAKES", "INSPECTION", "REPAIR", "OTHER"].includes(String(formData.get("type"))) ? String(formData.get("type")) : "REPAIR";
  const odo = Number(String(formData.get("odometer") ?? "").replace(/\D/g, ""));
  const cost = Number(formData.get("cost"));
  await db.vehicleMaintenance.create({
    data: {
      vehicleId,
      date: new Date(dateRaw + "T12:00:00Z"),
      type,
      odometer: Number.isFinite(odo) && odo > 0 ? odo : null,
      cost: Number.isFinite(cost) && cost >= 0 ? cost : null,
      vendor: String(formData.get("vendor") ?? "").trim().slice(0, 100) || null,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 500) || null,
    },
  });
  // keep the vehicle's odometer current
  if (Number.isFinite(odo) && odo > 0) {
    await db.vehicle.updateMany({ where: { id: vehicleId, OR: [{ odometer: null }, { odometer: { lt: odo } }] }, data: { odometer: odo } });
  }
  revalidatePath(`/fleet/${vehicleId}`);
  return { ok: true };
}

export async function addIncident(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const v = await scopedVehicle(session, vehicleId);
  if (!v) return { ok: false, error: "Vehicle not found." };
  const dateRaw = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { ok: false, error: "Pick the date." };
  if (description.length < 5) return { ok: false, error: "Describe what happened." };

  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.type.startsWith("image/") && photo.size <= 8 * 1024 * 1024) {
    photoPath = `incidents/${vehicleId}/${Date.now()}.jpg`;
    await uploadChatImage(photoPath, await photo.arrayBuffer(), photo.type).catch(() => { photoPath = null; });
  }

  await db.vehicleIncident.create({
    data: {
      vehicleId,
      date: new Date(dateRaw + "T12:00:00Z"),
      driver: String(formData.get("driver") ?? "").trim().slice(0, 80) || null,
      description,
      photoPath,
      policeReport: String(formData.get("policeReport") ?? "").trim().slice(0, 60) || null,
    },
  });

  // incidents are serious — bell every admin immediately
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  await Promise.all(admins.map(a =>
    db.notification.create({
      data: { type: "TASK_OVERDUE", title: `🚨 Vehicle incident: ${v.name}`, body: description.slice(0, 120), link: `/fleet/${vehicleId}`, userId: a.id },
    }).catch(() => null),
  ));
  revalidatePath(`/fleet/${vehicleId}`);
  return { ok: true };
}

export async function updateClaim(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ops")) return { ok: false, error: "No operations permission." };
  const id = String(formData.get("incidentId") ?? "");
  const inc = await db.vehicleIncident.findUnique({ where: { id }, select: { vehicleId: true, vehicle: { select: { locationId: true } } } });
  if (!inc || !inScope(session, inc.vehicle.locationId)) return { ok: false, error: "Incident not found." };

  const status = ["OPEN", "CLAIM_FILED", "RESOLVED"].includes(String(formData.get("status"))) ? String(formData.get("status")) : "OPEN";
  const claimStatus = ["", "FILED", "APPROVED", "PAID", "DENIED"].includes(String(formData.get("claimStatus"))) ? String(formData.get("claimStatus")) || null : null;
  const amt = Number(formData.get("claimAmount"));
  await db.vehicleIncident.update({
    where: { id },
    data: {
      status,
      claimNumber: String(formData.get("claimNumber") ?? "").trim().slice(0, 60) || null,
      insurer: String(formData.get("insurer") ?? "").trim().slice(0, 100) || null,
      claimAmount: Number.isFinite(amt) && amt >= 0 ? amt : null,
      claimStatus,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 1000) || null,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    },
  });
  revalidatePath(`/fleet/${inc.vehicleId}`);
  return { ok: true };
}
