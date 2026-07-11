"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PublicConsumerLeadService } from "@rhino/services";
import { BRAND_KEY } from "@/lib/brand";

export type ConsumerFormState = { ok?: boolean; error?: string };

function clientIp(): string {
  return (headers().get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

/** Consumer installed-price / appointment / installer-needed submissions. */
export async function submitConsumerRequest(_prev: ConsumerFormState, formData: FormData): Promise<ConsumerFormState> {
  if (String(formData.get("website") ?? "")) return { ok: true }; // honeypot
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "INSTALLED_PRICE" && kind !== "APPOINTMENT" && kind !== "INSTALLER_NEEDED") return { error: "Invalid request." };

  const ip = clientIp();
  const result = await PublicConsumerLeadService.create(
    kind,
    {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      zip: String(formData.get("zip") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      tireSize: String(formData.get("tireSize") ?? ""),
      quantity: String(formData.get("quantity") ?? "4"),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      preferredContact: "phone",
      message: String(formData.get("message") ?? ""),
      vehicle: String(formData.get("vehicle") ?? ""),
      consent: formData.get("consent") === "true",
    },
    {
      rateKey: ip,
      ip,
      brandKey: BRAND_KEY,
      sourceUrl: headers().get("referer") ?? undefined,
      installerId: String(formData.get("installerId") ?? "") || undefined,
    },
  );
  if (!result.ok) return { error: result.error };
  redirect(`/request/${result.consumerToken}`);
}
