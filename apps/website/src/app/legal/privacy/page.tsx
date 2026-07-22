import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What information this website collects, how it is used, and how to reach us about it.",
  alternates: { canonical: "/legal/privacy" },
};

export default async function PrivacyPage() {
  const brand = await getBrand();
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        This policy describes what information {brand.legalName} (&quot;we&quot;) collects through this website and how we use it.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Information you submit in forms — quote requests, dealer applications, fleet inquiries, contact and installation requests (name, company, phone, email, address, and what you tell us about your needs).</li>
        <li>Files you choose to upload with an application (for example a resale certificate).</li>
        <li>Messages you send to the AI assistant on this site. Conversations may be logged to improve service.</li>
        <li>Standard usage analytics (pages visited, device type) collected through analytics tools.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To respond to your inquiry, prepare quotes, and process dealer applications.</li>
        <li>To route installation requests to installers in our network — the installer receives what they need to serve you (your request details and contact information).</li>
        <li>To operate and improve the website and our service.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We do not sell your personal information.</li>
        <li>We do not collect payment card numbers, bank details, or government IDs through this website.</li>
      </ul>
      <h2>Retention and access</h2>
      <p>
        Business inquiries are kept in our customer system for as long as the relationship is active. To ask what we hold about
        you or request deletion, call {brand.phoneDisplay}{brand.contactEmail ? ` or email ${brand.contactEmail}` : ""}.
      </p>
    </>
  );
}
