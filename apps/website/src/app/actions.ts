"use server";

import { headers } from "next/headers";
import { PublicLeadService, type PublicLeadResult } from "@rhino/services";

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

/** Dealer application → Lead (source WEBSITE_DEALER_APP). */
export async function submitDealerApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get("website") ?? "")) return { ok: true };
  const result: PublicLeadResult = await PublicLeadService.createDealerApplication(
    {
      companyName: String(formData.get("companyName") ?? ""),
      contactPerson: String(formData.get("contactPerson") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      businessType: String(formData.get("businessType") ?? ""),
      monthlyVolume: String(formData.get("monthlyVolume") ?? ""),
      locationsCount: String(formData.get("locationsCount") ?? ""),
      deliveryZip: String(formData.get("deliveryZip") ?? ""),
      productsOfInterest: String(formData.get("productsOfInterest") ?? ""),
    },
    clientKey(),
  );
  return result.ok ? { ok: true } : { error: result.error };
}
