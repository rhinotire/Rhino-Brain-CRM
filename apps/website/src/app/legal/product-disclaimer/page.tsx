import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Disclaimer",
  description: "Fitment, load, and application information on this site must be verified against manufacturer specifications.",
  alternates: { canonical: "/legal/product-disclaimer" },
};

export default function ProductDisclaimerPage() {
  return (
    <>
      <h1>Product Disclaimer</h1>
      <p>
        <strong>
          Product fitment, load capacity, pressure, and application must be verified using the vehicle, trailer, wheel, and tire
          manufacturer specifications.
        </strong>
      </p>
      <ul>
        <li>Tire sizes, load ranges, ply ratings, speed ratings, and inflation pressures shown on this site are supplied by manufacturers and may contain errors. The markings on the product and the manufacturer&apos;s documentation always control.</li>
        <li>Trailer tires must match or exceed the load requirements on the trailer&apos;s VIN/certification plate. Never install a lower load range than the plate requires.</li>
        <li>Wheel fitment (bolt pattern, offset, center bore, load rating) must be verified for the specific vehicle or trailer before installation.</li>
        <li>Calculators, guides, and the AI assistant on this site provide general reference information — they are not professional fitment advice and are no substitute for a qualified installer.</li>
        <li>Tires and wheels should be installed, balanced, and torqued by qualified personnel following the component manufacturers&apos; procedures.</li>
      </ul>
      <p>Warranty coverage, if any, is provided by the product manufacturer under the manufacturer&apos;s own terms.</p>
    </>
  );
}
