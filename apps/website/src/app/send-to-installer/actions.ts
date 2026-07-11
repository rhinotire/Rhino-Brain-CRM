"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PublicReferralService } from "@rhino/services";
import { BRAND_KEY } from "@/lib/brand";
import { SITE } from "@/lib/site";

export type StiFormState = { ok?: boolean; error?: string };

export async function submitSendToInstaller(_prev: StiFormState, formData: FormData): Promise<StiFormState> {
  if (String(formData.get("website_hp") ?? "")) return { ok: true }; // honeypot
  const ip = (headers().get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const result = await PublicReferralService.createSendToInstaller(
    {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      zip: String(formData.get("zip") ?? ""),
      quantity: String(formData.get("quantity") ?? "4"),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      vehicle: String(formData.get("vehicle") ?? ""),
      message: String(formData.get("message") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      tireSize: String(formData.get("tireSize") ?? ""),
      installerName: String(formData.get("installerName") ?? ""),
      installerPhone: String(formData.get("installerPhone") ?? ""),
      installerAddress: String(formData.get("installerAddress") ?? ""),
      installerZip: String(formData.get("installerZip") ?? ""),
      installerWebsite: String(formData.get("installerWebsite") ?? ""),
      consent: formData.get("consent") === "true",
    },
    { rateKey: ip, ip, brandKey: BRAND_KEY, sourceUrl: headers().get("referer") ?? undefined, siteUrl: SITE.url },
  );
  if (!result.ok) return { error: result.error };
  redirect(`/request/${result.consumerToken}`);
}

export async function installerAccept(token: string): Promise<{ ok: boolean }> {
  return PublicReferralService.accept(token);
}
export async function installerDecline(token: string): Promise<{ ok: boolean }> {
  return PublicReferralService.decline(token);
}
export async function installerRequestPrice(token: string): Promise<{ ok: boolean }> {
  return PublicReferralService.requestWholesalePrice(token);
}
