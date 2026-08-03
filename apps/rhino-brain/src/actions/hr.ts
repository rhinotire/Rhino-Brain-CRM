"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, locationScope, defaultLocationId, type Session } from "@/lib/auth";
import { uploadEmployeeObject, createEmployeeSignedUrl, deleteEmployeeObject, isStorageConfigured } from "@/lib/storage";
import { canDownloadEmployeeDoc, canDeleteEmployeeDoc } from "@rhino/services";
import { SENSITIVE_EMPLOYEE_DOC_TYPES, employeeDocTypeLabels } from "@/lib/domain";
import type { ActionResult } from "./auth";
import type { EmployeeDocType, EmployeeStatus } from "@prisma/client";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/** Employee visible to this session (location isolation), or null. */
async function getScopedEmployee(session: Session, employeeId: string) {
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return null;
  const guard = locationScope(session);
  if (guard.locationId && emp.locationId !== guard.locationId) return null;
  return emp;
}

function readEmployeeFields(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const date = (k: string) => { const v = str(k); return v ? new Date(v) : null; };
  const status = (String(formData.get("status") ?? "ACTIVE") === "TERMINATED" ? "TERMINATED" : "ACTIVE") as EmployeeStatus;
  return {
    name: String(formData.get("name") ?? "").trim(),
    position: str("position"),
    phone: str("phone"),
    email: str("email"),
    hireDate: date("hireDate"),
    status,
    endDate: status === "TERMINATED" ? date("endDate") : null,
    notes: str("notes"),
    userId: str("userId"),
  };
}

export async function createEmployee(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "HR is manager-only." };

  const fields = readEmployeeFields(formData);
  if (!fields.name) return { ok: false, error: "Name is required." };
  const locationId = defaultLocationId(session, String(formData.get("locationId") ?? "") || null);
  if (!locationId) return { ok: false, error: "Choose a company/location." };

  await db.employee.create({ data: { ...fields, locationId } });
  revalidatePath("/hr");
  return { ok: true };
}

export async function updateEmployee(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "HR is manager-only." };

  const employeeId = String(formData.get("employeeId") ?? "");
  const emp = await getScopedEmployee(session, employeeId);
  if (!emp) return { ok: false, error: "Employee not found." };

  const fields = readEmployeeFields(formData);
  if (!fields.name) return { ok: false, error: "Name is required." };
  // Only admins may move an employee between companies.
  const locationId = session.role === "ADMIN"
    ? (String(formData.get("locationId") ?? "") || emp.locationId)
    : emp.locationId;

  await db.employee.update({ where: { id: employeeId }, data: { ...fields, locationId } });
  revalidatePath("/hr");
  revalidatePath(`/hr/${employeeId}`);
  return { ok: true };
}

export async function uploadEmployeeDocument(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "HR is manager-only." };
  if (!isStorageConfigured()) return { ok: false, error: "Document storage is not configured yet — ask the admin to add the Supabase storage key." };

  const employeeId = String(formData.get("employeeId") ?? "");
  const type = String(formData.get("type") ?? "OTHER") as EmployeeDocType;
  const expiresAtRaw = String(formData.get("expiresAt") ?? "");
  const file = formData.get("file") as File | null;

  if (!(type in employeeDocTypeLabels)) return { ok: false, error: "Unknown document type." };
  if (!employeeId || !file || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_SIZE) return { ok: false, error: "File is too large (max 10 MB)." };
  if (!ALLOWED_MIME.includes(file.type)) return { ok: false, error: "Only PDF and image files are allowed." };

  const emp = await getScopedEmployee(session, employeeId);
  if (!emp) return { ok: false, error: "Employee not found." };

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const storagePath = `${employeeId}/${type}/${Date.now()}-${safeName}`;
  await uploadEmployeeObject(storagePath, await file.arrayBuffer(), file.type);

  await db.employeeDocument.create({
    data: {
      employeeId,
      type,
      fileName: file.name,
      storagePath,
      fileSize: file.size,
      mimeType: file.type,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
      sensitive: SENSITIVE_EMPLOYEE_DOC_TYPES.includes(type),
      uploadedById: session.userId,
    },
  });
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/hr");
  return { ok: true };
}

export async function getEmployeeDocumentUrl(documentId: string): Promise<{ url?: string; error?: string }> {
  const session = await requireSession();
  if (!isManager(session)) return { error: "HR is manager-only." };
  const doc = await db.employeeDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { error: "Document not found." };
  const emp = await getScopedEmployee(session, doc.employeeId);
  if (!emp) return { error: "Document not found." };
  if (!canDownloadEmployeeDoc(session.role, doc.sensitive)) return { error: "Only the admin can open this document." };
  try {
    return { url: await createEmployeeSignedUrl(doc.storagePath, 300) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create download link." };
  }
}

export async function deleteEmployeeDocument(documentId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!canDeleteEmployeeDoc(session.role)) return { ok: false, error: "Only the admin can delete documents." };
  const doc = await db.employeeDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, error: "Document not found." };
  await deleteEmployeeObject(doc.storagePath).catch(() => {});
  await db.employeeDocument.delete({ where: { id: documentId } });
  revalidatePath(`/hr/${doc.employeeId}`);
  revalidatePath("/hr");
  return { ok: true };
}
