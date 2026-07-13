import Link from "next/link";
import { requireSession, isManager, adminLocFilter } from "@/lib/auth";
import { LocationSwitcher } from "@/components/location-switcher";
import { db } from "@/lib/db";
import { logout } from "@/actions/auth";
import { roleLabels } from "@/lib/domain";
import { NotificationBell } from "@/components/notification-bell";
import { ResponsiveShell } from "@/components/responsive-shell";
import { SidebarNav, type NavGroup } from "@/components/sidebar-nav";

// Grouped navigation (owner-approved layout, 2026-07-13). AI Assistant is
// pinned at the bottom — it's a tool, not a page in the daily flow.
const managerGroups: NavGroup[] = [
  { items: [
    { href: "/dashboard", label: "Dashboard", icon: "▦" },
    { href: "/my-work", label: "My Work Today", icon: "★" },
  ]},
  { title: "Sales", items: [
    { href: "/customers", label: "Customers", icon: "🏬" },
    { href: "/pipeline", label: "Lead Pipeline", icon: "⇉" },
    { href: "/leads", label: "Leads List", icon: "☰" },
    { href: "/consumer-leads", label: "Consumer Leads", icon: "🛞" },
    { href: "/quotes", label: "Quotes", icon: "＄" },
    { href: "/opportunities", label: "Opportunities", icon: "◎" },
  ]},
  { title: "Daily Work", items: [
    { href: "/tasks", label: "Tasks", icon: "✓" },
    { href: "/activities", label: "Activities", icon: "☎" },
    { href: "/chat", label: "Team Chat", icon: "💬" },
  ]},
  { title: "Products", items: [
    { href: "/products", label: "Products & Stock", icon: "📦" },
    { href: "/spec-review", label: "Spec Review", icon: "🔍" },
    { href: "/lost-sales", label: "Lost Sales", icon: "💸" },
    { href: "/flyers", label: "Special Flyers", icon: "📣" },
  ]},
  { title: "Finance & Reports", items: [
    { href: "/ar", label: "A/R Aging", icon: "💰" },
    { href: "/reports/sales-reps", label: "Rep Performance", icon: "▲" },
    { href: "/reports/customers", label: "Customer Reports", icon: "◔" },
  ]},
];

const websiteGroup = (isAdmin: boolean): NavGroup => ({
  title: "Website",
  items: [
    { href: "/articles", label: "Knowledge Center", icon: "📝" },
    ...(isAdmin ? [{ href: "/settings/website", label: "Brand & Banners", icon: "🌐" }] : []),
  ],
});

const settingsGroup = (isAdmin: boolean): NavGroup => ({
  title: "Settings",
  items: [
    ...(isAdmin ? [{ href: "/settings/users", label: "Users", icon: "⚙" }] : []),
    { href: "/settings/import", label: "Import / Export", icon: "⇅" },
  ],
});

const repGroups: NavGroup[] = [
  { items: [{ href: "/my-work", label: "My Work Today", icon: "★" }] },
  { title: "Sales", items: [
    { href: "/customers", label: "My Customers", icon: "🏬" },
    { href: "/pipeline", label: "My Leads", icon: "⇉" },
    { href: "/consumer-leads", label: "Consumer Leads", icon: "🛞" },
    { href: "/quotes", label: "My Quotes", icon: "＄" },
    { href: "/opportunities", label: "Opportunities", icon: "◎" },
  ]},
  { title: "Daily Work", items: [
    { href: "/tasks", label: "My Tasks", icon: "✓" },
    { href: "/activities", label: "My Activities", icon: "☎" },
    { href: "/chat", label: "Team Chat", icon: "💬" },
  ]},
  { title: "Products", items: [
    { href: "/products", label: "Products & Stock", icon: "📦" },
    { href: "/lost-sales", label: "My Lost Sales", icon: "💸" },
    { href: "/ar", label: "My A/R", icon: "💰" },
  ]},
];

// Accounting: A/R-focused, read-only, cross-company.
const accountingGroups: NavGroup[] = [
  { items: [
    { href: "/ar", label: "A/R Aging", icon: "💰" },
    { href: "/customers", label: "Customers", icon: "🏬" },
    { href: "/chat", label: "Team Chat", icon: "💬" },
  ]},
];

const AI_ITEM = { href: "/assistant", label: "AI Assistant", icon: "🤖" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const showSwitcher = session.role === "ADMIN" || session.role === "ACCOUNTING";
  const locations = showSwitcher
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true, color: true } })
    : [];
  const currentLoc = showSwitcher ? adminLocFilter() : null;
  const manager = isManager(session);
  const groups: NavGroup[] =
    session.role === "ACCOUNTING"
      ? accountingGroups
      : manager
        ? [...managerGroups, websiteGroup(session.role === "ADMIN"), settingsGroup(session.role === "ADMIN")]
        : repGroups;

  const notifications = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const unread = notifications.filter(n => !n.read).length;

  const sidebar = (
    <>
      <div className="px-3 py-4">
          <Link href="/" className="block">
            {/* full logo includes the wordmark + tagline; black bg blends with the sidebar */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rhino-brain-logo.png" alt="Rhino Brain — AI Business Command Center" className="w-full rounded-lg" />
          </Link>
        </div>
        {showSwitcher && locations.length > 0 && (
          <LocationSwitcher locations={locations} current={currentLoc} />
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          <SidebarNav groups={groups} pinned={AI_ITEM} />
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
