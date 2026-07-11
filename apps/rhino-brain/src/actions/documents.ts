"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting } from "@/lib/auth";
import { uploadObject, createSignedUrl, deleteObject, isStorageConfigured } from "@/lib/storage";
import type { ActionResult } from "./auth";
import type { DocumentType } from "@prisma/client";

const SENSITIVE_TYPES: DocumentType[] = ["DRIVER_LICENSE", "CREDIT_CARD_AUTH"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

export async function uploadCustomerDocument(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!isStorageConfigured()) return { ok: false, error: "Document storage is not configured yet — ask the admin to add the Supabase storage key." };

  const customerId = String(formData.get("customerId") ?? "");
  const type = String(formData.get("type") ?? "OTHER") as DocumentType;
  const expiresAtRaw = String(formData.get("expiresAt") ?? "");
  const file = formData.get("file") as File | null;

  if (!customerId || !file || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_SIZE) return { ok: false, error: "File is too large (max 10 MB)." };
  if (!ALLOWED_MIME.includes(file.type)) return { ok: false, error: "Only PDF and image files are allowed." };

  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, assignedRepId: true } });
  if (!customer) return { ok: false, error: "Customer not found." };
  if (!isManager(session) && customer.assignedRepId !== session.userId)
    return { ok: false, error: "You can only upload documents for your own customers." };

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const storagePath = `${customerId}/${type}/${Date.now()}-${safeName}`;
  await uploadObject(storagePath, await file.arrayBuffer(), file.type);

  await db.customerDocument.create({
    data: {
      customerId,
      type,
      fileName: file.name,
      storagePath,
      fileSize: file.size,
      mimeType: file.type,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
      sensitive: SENSITIVE_TYPES.includes(type),
      uploadedById: session.userId,
    },
  });
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function getDocumentDownloadUrl(documentId: string): Promise<{ url?: string; error?: string }> {
  const session = await requireSession();
  const doc = await db.customerDocument.findUnique({ where: { id: documentId }, include: { customer: { select: { assignedRepId: true } } } });
  if (!doc) return { error: "Document not found." };
  // Accounting can pull credit-card authorizations (billing) but not driver licenses.
  const acctCanView = isAccounting(session) && doc.type === "CREDIT_CARD_AUTH";
  if (doc.sensitive && !isManager(session) && !acctCanView) return { error: "Only managers can download this document." };
  if (!isManager(session) && !isAccounting(session) && doc.customer.assignedRepId !== session.userId) return { error: "Not your customer." };
  try {
    return { url: await createSignedUrl(doc.storagePath, 300) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create download link." };
  }
}

export async function deleteCustomerDocument(documentId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can delete documents." };
  const doc = await db.customerDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, error: "Document not found." };
  await deleteObject(doc.storagePath).catch(() => {});
  await db.customerDocument.delete({ where: { id: documentId } });
  revalidatePath(`/customers/${doc.customerId}`);
  return { ok: true };
}
