import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms that apply to using this website.",
  alternates: { canonical: "/legal/terms" },
};

export default async function TermsPage() {
  const brand = await getBrand();
  return (
    <>
      <h1>Terms of Use</h1>
      <p>By using this website you agree to these terms. If you do not agree, please do not use the site.</p>
      <h2>Informational content</h2>
      <ul>
        <li>Product listings, stock statuses, and specifications are provided for convenience and may change without notice. A listing is not an offer; availability and pricing are confirmed only in a written quote from {brand.legalName}.</li>
        <li>Wholesale pricing requires an approved dealer account. Quotes are valid only for the period stated on the quote.</li>
        <li>Calculators, guides, and the AI assistant provide general information only — see the Product Disclaimer.</li>
      </ul>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not scrape, disrupt, or attempt to gain unauthorized access to the site or its data.</li>
        <li>Do not submit false or misleading information in forms.</li>
      </ul>
      <h2>Intellectual property</h2>
      <p>
        Site content, design, and branding belong to {brand.legalName} or their respective owners. Product brand names and logos
        belong to their manufacturers.
      </p>
      <h2>Liability</h2>
      <p>
        The site is provided &quot;as is.&quot; To the maximum extent permitted by law, {brand.legalName} is not liable for damages
        arising from use of the site or reliance on its informational content. Commercial terms of sale are established in
        quotes, invoices, and dealer agreements — not on this website.
      </p>
    </>
  );
}
