"use server";

import { redirect } from "next/navigation";
import { DealerAuthService, rateLimited } from "@rhino/services";
import { createDealerSession, destroyDealerSession } from "@/lib/dealer-session";

export type DealerLoginState = { error?: string };

export async function dealerLogin(_prev: DealerLoginState, formData: FormData): Promise<DealerLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  if (rateLimited(`dealer-login:${email.toLowerCase()}`)) {
    return { error: "Too many attempts — wait a minute and try again." };
  }
  const identity = await DealerAuthService.authenticate(email, password);
  if (!identity) return { error: "Email or password is incorrect, or the account is inactive." };
  await createDealerSession(identity);
  redirect("/dealer/catalog");
}

export async function dealerLogout() {
  destroyDealerSession();
  redirect("/dealer/login");
}
