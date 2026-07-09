"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * App shell: fixed sidebar on desktop (lg+), slide-in drawer with backdrop
 * on phones/small tablets. Closes on navigation.
 */
export function ResponsiveShell({ sidebar, bell, children }: {
  sidebar: ReactNode;
  bell: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink-900 text-slate-300 transition-transform duration-200 lg:w-56 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1 lg:ml-56">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:justify-end lg:px-6">
          <button type="button" onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu">
            <span className="text-lg leading-none">☰</span> Menu
          </button>
          {bell}
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
