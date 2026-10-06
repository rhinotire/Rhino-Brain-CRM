import Link from "next/link";
import { requireSession, isManager, adminLocFilter, hasPerm } from "@/lib/auth";
import { generateOpsReminders } from "@/lib/ops-reminders";
import { LocationSwitcher } from "@/components/location-switcher";
import { db } from "@/lib/db";
import { logout } from "@/actions/auth";
import { roleLabels } from "@/lib/domain";
import { NotificationBell } from "@/components/notification-bell";
import { ResponsiveShell } from "@/components/responsive-shell";
import { SidebarNav, type NavGroup, type NavItem } from "@/components/sidebar-nav";

// Grouped navigation (owner-approved layout, 2026-07-13). AI Assistant is
// pinned at the bottom — it's a tool, not a page in the daily flow.
const managerGroups: NavGroup[] = [
  { items: [
    { href: "/dashboard", label: "Dashboard", icon: "▦" },
    { href: "/my-work", label: "My Work Today", icon: "★" },
    { href: "/field", label: "Field Mode", icon: "🧭" },
    { href: "/phone", label: "Phone", icon: "☎" },
  ]},
  { title: "Sales", items: [
    { href: "/customers", label: "Customers", icon: "🏬" },
    { href: "/pipeline", label: "Lead Pipeline", icon: "⇉" },
    { href: "/leads", label: "Leads List", icon: "☰" },
    { href: "/prospecting", label: "Prospecting (AI)", icon: "🧭" },
    { href: "/consumer-leads", label: "Consumer Leads", icon: "🛞" },
    { href: "/installers", label: "Installers", icon: "🔧" },
    { href: "/quotes", label: "Quotes", icon: "＄" },
    { href: "/portal-orders", label: "Portal Orders", icon: "🛒" },
    { href: "/opportunities", label: "Opportunities", icon: "◎" },
  ]},
  { title: "Daily Work", items: [
    { href: "/tasks", label: "Tasks", icon: "✓" },
    { href: "/activities", label: "Activities", icon: "☎" },
    { href: "/field/report", label: "Field Report", icon: "🗺️" },
    { href: "/chat", label: "Team Chat", icon: "💬" },
  ]},
  { title: "Products", items: [
    { href: "/products", label: "Products & Stock", icon: "📦" },
    { href: "/freight", label: "Freight", icon: "🚚" },
    { href: "/spec-review", label: "Spec Review", icon: "🔍" },
    { href: "/lost-sales", label: "Lost Sales", icon: "💸" },
    { href: "/flyers", label: "Special Flyers", icon: "📣" },
  ]},
  { title: "Finance & Reports", items: [
    { href: "/ar", label: "A/R Aging", icon: "💰" },
    { href: "/reports/sales-reps", label: "Rep Performance", icon: "▲" },
    { href: "/reports/customers", label: "Customer Reports", icon: "◔" },
  ]},
  { title: "HR", items: [
    { href: "/hr", label: "Employees", icon: "👥" },
    { href: "/ops", label: "Operations", icon: "🛠" },
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
  { items: [
    { href: "/field", label: "Field Mode", icon: "🧭" },
    { href: "/my-work", label: "My Work Today", icon: "★" },
    { href: "/phone", label: "Phone", icon: "☎" },
  ] },
  { title: "Sales", items: [
    { href: "/customers", label: "My Customers", icon: "🏬" },
    { href: "/pipeline", label: "My Leads", icon: "⇉" },
    { href: "/consumer-leads", label: "Consumer Leads", icon: "🛞" },
    { href: "/quotes", label: "My Quotes", icon: "＄" },
    { href: "/portal-orders", label: "Portal Orders", icon: "🛒" },
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
    { href: "/phone", label: "Phone", icon: "☎" },
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
  // lazy ops reminders: fire whenever someone with ops permission loads any page (no cron needed)
  if (hasPerm(session, "ops")) await generateOpsReminders().catch(() => {});
  const baseGroups: NavGroup[] =
    session.role === "ACCOUNTING"
      ? accountingGroups
      : manager
        ? [...managerGroups, websiteGroup(session.role === "ADMIN"), settingsGroup(session.role === "ADMIN")]
        : repGroups;

  // per-user module permissions hide nav entries (pages are guarded server-side too)
  const NAV_PERM: [string, Parameters<typeof hasPerm>[1]][] = [
    ["/ar", "ar"], ["/activities", "activities"], ["/hr", "hr"], ["/ops", "ops"], ["/reports", "reports"],
    ["/freight", "freight"], ["/phone", "phone"], ["/settings/import", "import_export"], ["/products", "products"],
  ];
  const navAllowed = (href: string) => {
    const hit = NAV_PERM.find(([p]) => href === p || href.startsWith(p + "/"));
    return !hit || hasPerm(session, hit[1]);
  };
  let groups: NavGroup[] = baseGroups
    .map(g => ({ ...g, items: g.items.filter(i => navAllowed(i.href)) }))
    .filter(g => g.items.length > 0);

  // granted modules that this role's base menu doesn't list (e.g. the GM on an
  // ACCOUNTING account with +hr/+ops) get appended so the grant is reachable
  const PERM_NAV_ITEM: Record<string, NavItem> = {
    hr: { href: "/hr", label: "Employees", icon: "👥" },
    ops: { href: "/ops", label: "Operations", icon: "🛠" },
    freight: { href: "/freight", label: "Freight", icon: "🚚" },
    reports: { href: "/reports/sales-reps", label: "Rep Performance", icon: "▲" },
    products: { href: "/products", label: "Products & Stock", icon: "📦" },
    activities: { href: "/activities", label: "Activities", icon: "☎" },
    phone: { href: "/phone", label: "Phone", icon: "☎" },
  };
  const present = new Set(groups.flatMap(g => g.items.map(i => i.href)));
  const extras = Object.entries(PERM_NAV_ITEM)
    .filter(([key, item]) => hasPerm(session, key as Parameters<typeof hasPerm>[1]) && !present.has(item.href))
    .map(([, item]) => item);
  if (extras.length > 0) groups = [...groups, { title: "Granted Access", items: extras }];

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
