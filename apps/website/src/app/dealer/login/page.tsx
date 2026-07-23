import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SITE } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";
import { getDealerSession } from "@/lib/dealer-session";
import { DealerLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Dealer Login",
  description:
    "Sign in to see your dealer pricing and live warehouse stock. Approved wholesale accounts only.",
  alternates: { canonical: "/dealer/login" },
  robots: { index: false },
};

export default async function DealerLoginPage() {
  if (await getDealerSession()) redirect("/dealer/catalog");
  return (
    <div className="mx-auto max-w-xl pt-12 text-center">
      <h1 className="h-display text-3xl text-navy-900">Dealer Portal</h1>
      <p className="mt-4 text-sm leading-relaxed text-steel-500">
        Sign in to browse the catalog with <span className="font-bold text-navy-900">your dealer pricing</span> and{" "}
        <span className="font-bold text-navy-900">live warehouse stock</span>. Ordering stays with your rep, the{" "}
        <Link href="/dealer/quick-order" className="font-bold text-brand-dark">quick order form</Link>, or{" "}
        <a href={`tel:${SITE.phone}`} className="font-bold text-brand-dark">{SITE.phoneDisplay}</a>.
      </p>

      <DealerLoginForm />

      <p className="mt-8 rounded-2xl border border-steel-200 bg-white p-6 text-left text-sm text-steel-500 shadow-card">
        <span className="font-bold text-navy-900">No dealer account yet?</span> Tire shops, trailer manufacturers and
        fleets qualify for {COPY.dealerQualifyLine}.{" "}
        <Link href="/become-a-dealer" className="font-bold text-brand-dark">Apply here</Link> — approval usually takes one
        business day. Portal logins are issued by your rep after approval.
      </p>
    </div>
  );
}
