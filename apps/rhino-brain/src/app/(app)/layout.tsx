import Link from "next/link";
import { requireSession, isManager, adminLocFilter } from "@/lib/auth";
import { LocationSwitcher } from "@/components/location-switcher";
import { db } from "@/lib/db";
import { logout } from "@/actions/auth";
import { roleLabels } from "@/lib/domain";
import { NotificationBell } from "@/components/notification-bell";
import { ResponsiveShell } from "@/components/responsive-shell";

const managerNav = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/chat", label: "Team Chat", icon: "💬" },
  { href: "/assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/flyers", label: "Special Flyers", icon: "📣" },
  { href: "/products", label: "Products & Stock", icon: "📦" },
  { href: "/lost-sales", label: "Lost Sales", icon: "💸" },
  { href: "/ar", label: "A/R Aging", icon: "💰" },
  { href: "/customers", label: "Customers", icon: "🏬" },
  { href: "/pipeline", label: "Lead Pipeline", icon: "⇉" },
  { href: "/leads", label: "Leads List", icon: "☰" },
  { href: "/consumer-leads", label: "Consumer Leads", icon: "🛞" },
  { href: "/quotes", label: "Quotes", icon: "＄" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/activities", label: "Activities", icon: "☎" },
  { href: "/opportunities", label: "Opportunities", icon: "◎" },
  { href: "/reports/sales-reps", label: "Rep Performance", icon: "▲" },
  { href: "/reports/customers", label: "Customer Reports", icon: "◔" },
];

const adminNav = [
  { href: "/settings/users", label: "Users", icon: "⚙" },
  { href: "/settings/import", label: "Import / Export", icon: "⇅" },
];

const repNav = [
  { href: "/my-work", label: "My Work Today", icon: "★" },
  { href: "/chat", label: "Team Chat", icon: "💬" },
  { href: "/assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/products", label: "Products & Stock", icon: "📦" },
  { href: "/lost-sales", label: "My Lost Sales", icon: "💸" },
  { href: "/ar", label: "My A/R", icon: "💰" },
  { href: "/customers", label: "My Customers", icon: "🏬" },
  { href: "/pipeline", label: "My Leads", icon: "⇉" },
  { href: "/consumer-leads", label: "Consumer Leads", icon: "🛞" },
  { href: "/quotes", label: "My Quotes", icon: "＄" },
  { href: "/tasks", label: "My Tasks", icon: "✓" },
  { href: "/activities", label: "My Activities", icon: "☎" },
  { href: "/opportunities", label: "Opportunities", icon: "◎" },
];

// Accounting: A/R-focused, read-only, cross-company.
const accountingNav = [
  { href: "/ar", label: "A/R Aging", icon: "💰" },
  { href: "/customers", label: "Customers", icon: "🏬" },
  { href: "/chat", label: "Team Chat", icon: "💬" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const showSwitcher = session.role === "ADMIN" || session.role === "ACCOUNTING";
  const locations = showSwitcher
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true, color: true } })
    : [];
  const currentLoc = showSwitcher ? adminLocFilter() : null;
  const manager = isManager(session);
  const nav = session.role === "ACCOUNTING" ? accountingNav : manager ? managerNav : repNav;

  const notifications = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const unread = notifications.filter(n => !n.read).length;

  const sidebar = (
    <>
      <div className="px-4 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rhino-brain-logo.png" alt="Rhino Brain" className="h-9 w-9 rounded" />
            <span className="text-base font-black leading-tight tracking-tight text-white">RHINO <span className="text-brand-500">BRAIN</span></span>
          </Link>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">AI Business Command Center</div>
        </div>
        {showSwitcher && locations.length > 0 && (
          <LocationSwitcher locations={locations} current={currentLoc} />
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {nav.map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-ink-800 hover:text-white">
              <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {manager && (
            <>
              <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {session.role === "ADMIN" ? "Settings" : "Team"}
              </div>
              {session.role === "ADMIN" && adminNav.map(item => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-ink-800 hover:text-white">
                  <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
              {session.role === "MANAGER" && (
                <Link href="/settings/import"
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-ink-800 hover:text-white">
                  <span className="w-4 text-center text-xs opacity-70">⇅</span> Import / Export
                </Link>
              )}
              <Link href="/my-work"
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-ink-800 hover:text-white">
                <span className="w-4 text-center text-xs opacity-70">★</span> My Work Today
              </Link>
            </>
          )}
        </nav>
        <div className="border-t border-ink-700 p-3">
          <div className="mb-2 px-1">
            <div className="text-sm font-medium text-white">{session.name}</div>
            <div className="text-xs text-slate-400">{roleLabels[session.role]}</div>
          </div>
          <form action={logout}>
            <button className="w-full rounded-md bg-ink-800 px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-ink-700 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
    </>
  );

  return (
    <ResponsiveShell
      sidebar={sidebar}
      bell={<NotificationBell notifications={notifications.map(n => ({
        id: n.id, title: n.title, body: n.body, link: n.link, read: n.read,
        createdAt: n.createdAt.toISOString(),
      }))} unread={unread} />}
    >
      {children}
    </ResponsiveShell>
  );
}
