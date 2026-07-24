import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DealerBanner } from "@/components/dealer-banner";
import { ChangePasswordForm } from "./change-password-form";
import { getDealerSession } from "@/lib/dealer-session";

export const metadata: Metadata = {
  title: "Account — Dealer Portal",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function DealerAccountPage() {
  const session = await getDealerSession();
  if (!session) redirect("/dealer/login");

  return (
    <div className="pt-6">
      <DealerBanner session={session} active="/dealer/account" />
      <h1 className="mt-5 text-2xl font-black">Account</h1>
      <p className="mt-1 text-sm text-steel-500">
        Signed in as <span className="font-bold text-navy-900">{session.name}</span> · {session.companyName}
      </p>
      <div className="mt-6 max-w-sm rounded-2xl border border-steel-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-black uppercase tracking-wide text-navy-900">Change Password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
