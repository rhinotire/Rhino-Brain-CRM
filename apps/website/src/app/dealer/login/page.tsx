import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Dealer Login",
  description:
    "Dealer portal for approved wholesale accounts. Until the portal launches, order through your rep, the quick order form, or by phone.",
  alternates: { canonical: "/dealer/login" },
  robots: { index: false },
};

export default function DealerLoginPage() {
  return (
    <div className="mx-auto max-w-xl pt-12 text-center">
      <h1 className="h-display text-3xl text-navy-900">Dealer Portal</h1>
      <p className="mt-4 text-sm leading-relaxed text-steel-500">
        The online dealer portal — live tier pricing, order history and one-click reorders — is in the works. Approved
        dealers order today through their rep, by phone, or with the quick order form.
      </p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link href="/dealer/quick-order" className="btn-gold">Dealer Quick Order</Link>
        <a href={`tel:${SITE.phone}`} className="btn-navy">Call {SITE.phoneDisplay}</a>
      </div>
      <p className="mt-8 rounded-2xl border border-steel-200 bg-white p-6 text-left text-sm text-steel-500 shadow-card">
        <span className="font-bold text-navy-900">No dealer account yet?</span> Tire shops, trailer manufacturers and
        fleets qualify for tier pricing, weekly Florida delivery runs and container programs.{" "}
        <Link href="/become-a-dealer" className="font-bold text-brand-dark">Apply here</Link> — approval usually takes one
        business day.
      </p>
    </div>
  );
}
