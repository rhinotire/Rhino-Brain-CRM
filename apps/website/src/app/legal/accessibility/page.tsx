import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "Our commitment to an accessible website and how to report barriers.",
  alternates: { canonical: "/legal/accessibility" },
};

export default async function AccessibilityPage() {
  const brand = await getBrand();
  return (
    <>
      <h1>Accessibility Statement</h1>
      <p>
        {brand.legalName} wants this website to be usable by everyone. We build toward the Web Content Accessibility Guidelines
        (WCAG) 2.2 level AA: semantic markup, keyboard navigation, visible focus states, labeled forms, alt text on meaningful
        images, and color contrast that meets the guidelines.
      </p>
      <h2>Known limitations</h2>
      <p>
        Some product images come from manufacturers without descriptive text, and some third-party embeds (such as maps) are
        outside our direct control. We work to improve these over time.
      </p>
      <h2>Found a barrier?</h2>
      <p>
        Tell us and we will fix it or provide the information another way: call {brand.phoneDisplay}
        {brand.contactEmail ? ` or email ${brand.contactEmail}` : ""}.
      </p>
    </>
  );
}
