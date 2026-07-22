import Link from "next/link";

/** Shared shell for legal pages — prose styling + the attorney-review notice (master instruction §24). */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Legal
      </nav>
      <div className="mt-2 max-w-3xl space-y-4 text-sm leading-relaxed text-slate-700 [&_h1]:text-2xl [&_h1]:font-black [&_h1]:text-navy-900 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-black [&_h2]:text-navy-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
        <p className="mt-10 border-t border-steel-200 pt-4 text-xs text-steel-400">
          This document is a working version pending attorney review and may be updated. Questions?{" "}
          <Link href="/contact" className="font-semibold text-brand-dark">Contact us</Link>.
        </p>
      </div>
    </div>
  );
}
