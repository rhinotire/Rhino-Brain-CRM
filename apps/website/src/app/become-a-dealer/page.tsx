import type { Metadata } from "next";
import Link from "next/link";
import { DealerForm } from "@/components/lead-forms";

export const metadata: Metadata = {
  title: "Become a Dealer — Wholesale Account Application",
  description:
    "Apply for a Rhino Tire USA dealer account: tier pricing on tires, wheels and trailer parts, Florida and Texas warehouses, weekly delivery runs.",
  alternates: { canonical: "/become-a-dealer" },
};

export default function DealerPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Become a Dealer
      </nav>
      <h1 className="mt-2 text-2xl font-black">Become a Dealer</h1>
      <ul className="mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>Dealer tier pricing (A–D) on the full catalog</li>
        <li>Orlando &amp; Dallas warehouses — same-week Florida delivery runs</li>
        <li>Pallet and container programs, mixed loads welcome</li>
      </ul>
      <DealerForm />
    </div>
  );
}
