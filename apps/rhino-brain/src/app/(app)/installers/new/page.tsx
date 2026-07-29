import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, adminLocFilter, locationScope } from "@/lib/auth";
import { InstallerForm, EMPTY_INSTALLER, type InstallerFormValues } from "@/components/installer-form";

export const dynamic = "force-dynamic";

export default async function NewInstallerPage({ searchParams }: { searchParams: { customer?: string } }) {
  const session = await requireSession();
  if (!isManager(session)) redirect("/installers");

  const isAdmin = session.role === "ADMIN";
  const locations = isAdmin
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })
    : [];

  // /installers/new?customer=<id> — arrived via "Convert to Installer" on a customer page
  let initial: InstallerFormValues = EMPTY_INSTALLER;
  if (searchParams.customer) {
    const c = await db.customer.findFirst({
      where: { id: searchParams.customer, ...locationScope(session) },
      select: { id: true, companyName: true, phone: true, email: true, address: true, city: true, state: true, zip: true },
    });
    if (c) {
      initial = {
        ...EMPTY_INSTALLER,
        customerId: c.id,
        storeName: c.companyName,
        phone: c.phone ?? "",
        email: c.email ?? "",
        address: c.address ?? "",
        city: c.city ?? "",
        state: c.state ?? "",
        zip: c.zip && /^\d{5}/.test(c.zip) ? c.zip.slice(0, 5) : "",
      };
    }
  }

  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-400">
        <Link href="/installers" className="hover:underline">Installers</Link> / New
      </nav>
      <h1 className="text-xl font-bold">Add Installer</h1>
      {initial.customerId && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Converting customer <span className="font-semibold">{initial.storeName}</span> — details prefilled, review and save.
        </p>
      )}
      <InstallerForm
        initial={initial}
        locations={locations}
        currentLocationId={isAdmin ? adminLocFilter() : null}
        showLocationSelect={isAdmin && locations.length > 1}
      />
    </div>
  );
}
