"use server";

import { headers } from "next/headers";
import { PublicLeadService, uploadDealerDoc, isDealerStorageConfigured, type PublicLeadResult } from "@rhino/services";

function clientKey(): string {
  const h = headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

export type FormState = { ok?: boolean; error?: string };

/** Quote request → Lead (source WEBSITE_QUOTE). Honeypot: hidden "website" field. */
export async function submitQuoteRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get("website") ?? "")) return { ok: true }; // bot honeypot — pretend success
  const result: PublicLeadResult = await PublicLeadService.createQuoteRequest(
    {
      companyName: String(formData.get("companyName") ?? ""),
      contactPerson: String(formData.get("contactPerson") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      productsOfInterest: String(formData.get("productsOfInterest") ?? ""),
      message: String(formData.get("message") ?? ""),
    },
    clientKey(),
  );
  return result.ok ? { ok: true } : { error: result.error };
}

/**
 * Fleet inquiry → Lead via the existing quote pipeline (no parallel lead
 * model — docs/everflow-website-plan.md). Fleet specifics are folded into
 * productsOfInterest/message so reps see the full picture in the CRM.
 */
export async function submitFleetInquiry(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get("website") ?? "")) return { ok: true }; // bot honeypot
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const details = [
    `FLEET INQUIRY — type: ${f("fleetType") || "n/a"}`,
    `Vehicles: ${f("vehicleCount") || "n/a"} (${f("vehicleType") || "type n/a"})`,
    `Monthly tire demand: ${f("monthlyDemand") || "n/a"}`,
    `Service area: ${f("serviceArea") || "n/a"}`,
    f("challenges") ? `Current challenges: ${f("challenges")}` : "",
  ].filter(Boolean).join("\n");
  const result: PublicLeadResult = await PublicLeadService.createQuoteRequest(
    {
      companyName: f("companyName"),
      contactPerson: f("contactPerson"),
      phone: f("phone"),
      email: f("email"),
      city: f("city"),
      state: f("state"),
      productsOfInterest: f("commonSizes") || "Fleet tire program",
      message: details,
    },
    clientKey(),
  );
  return result.ok ? { ok: true } : { error: result.error };
}

const CERT_MAX = 10 * 1024 * 1024;
const CERT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Dealer application → Lead (source WEBSITE_DEALER_APP), optional resale-certificate upload. */
export async function submitDealerApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get("website") ?? "")) return { ok: true };

  // Optional resale certificate — validated, stored in the private dealer-docs bucket
  let resaleCertPath: string | null = null;
  const file = formData.get("resaleCert");
  if (file instanceof File && file.size > 0) {
    if (file.size > CERT_MAX) return { error: "Certificate file too large (max 10 MB)." };
    if (!CERT_MIME.includes(file.type)) return { error: "Certificate must be a PDF, JPG, PNG, or WebP file." };
    if (!isDealerStorageConfigured()) return { error: "Uploads are temporarily unavailable — submit without the file and email it to us." };
    const company = String(formData.get("companyName") ?? "dealer").replace(/[^\w.-]+/g, "_").slice(0, 40);
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    resaleCertPath = `resale-certificates/${company}-${Date.now()}.${ext}`;
    try {
      await uploadDealerDoc(resaleCertPath, await file.arrayBuffer(), file.type);
    } catch {
      return { error: "File upload failed — submit without the file and email it to us." };
    }
  }

  const result: PublicLeadResult = await PublicLeadService.createDealerApplication(
    {
      companyName: String(formData.get("companyName") ?? ""),
      contactPerson: String(formData.get("contactPerson") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      businessType: String(formData.get("businessType") ?? ""),
      address: String(formData.get("address") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      monthlyVolume: String(formData.get("monthlyVolume") ?? ""),
      locationsCount: String(formData.get("locationsCount") ?? ""),
      deliveryZip: String(formData.get("deliveryZip") ?? ""),
      productsOfInterest: String(formData.get("productsOfInterest") ?? ""),
    },
    clientKey(),
    { resaleCertPath },
  );
  return result.ok ? { ok: true } : { error: result.error };
}
