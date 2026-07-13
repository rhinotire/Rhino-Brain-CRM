"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { title?: string; items: NavItem[] };

/** Grouped sidebar navigation with active-route highlighting. */
export function SidebarNav({ groups, pinned }: { groups: NavGroup[]; pinned?: NavItem }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" || href === "/my-work" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const link = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
          active
            ? "bg-brand-500/15 font-semibold text-brand-500"
            : "hover:bg-ink-800 hover:text-white"
        }`}
      >
        <span className={`w-4 text-center text-xs ${active ? "" : "opacity-70"}`}>{item.icon}</span>
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {groups.map((g, i) => (
        <div key={g.title ?? i}>
          {g.title && (
            <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {g.title}
            </div>
          )}
          {g.items.map(link)}
        </div>
      ))}
      {pinned && (
        <div className="mt-3 border-t border-ink-700 pt-2">
          {link(pinned)}
        </div>
      )}
    </>
  );
}
