"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The root layout hard-codes <html lang="en"> (App Router allows only one root
 * layout); Spanish pages mount this to correct the document language for
 * screen readers and search engines.
 */
export function SetLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "en";
    };
  }, [lang]);
  return null;
}

/** EN pages with a Spanish twin — everything else falls back to /es. */
const EN_TO_ES: Record<string, string> = {
  "/": "/es",
  "/quote": "/es/quote",
  "/become-a-dealer": "/es/become-a-dealer",
  "/find-installation": "/es/find-installation",
};

/** Header language toggle. Lives in the navy microbar next to the phone number. */
export function LangSwitch() {
  const path = usePathname() || "/";
  const isEs = path === "/es" || path.startsWith("/es/");
  const target = isEs ? (path === "/es" ? "/" : path.slice(3) || "/") : (EN_TO_ES[path] ?? "/es");
  return (
    <Link
      href={target}
      className="shrink-0 rounded-md border border-white/25 px-2 py-0.5 text-xs font-bold text-white transition hover:border-brand hover:text-brand-light"
      aria-label={isEs ? "Switch to English" : "Cambiar a español"}
    >
      {isEs ? "English" : "Español"}
    </Link>
  );
}
