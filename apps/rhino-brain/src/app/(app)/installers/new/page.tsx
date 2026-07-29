import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, adminLocFilter } from "@/lib/auth";
import { InstallerForm, EMPTY_INSTALLER } from "@/components/installer-form";

export const dynamic = "force-dynamic";

export default async function NewInstallerPage() {
  const session = await requireSession();
  if (!isManager(session)) redirect("/installers");

  const isAdmin = session.role === "ADMIN";
  const locations = isAdmin
    ? await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-400">
        <Link href="/installers" className="hover:underline">Installers</Link> / New
      </nav>
      <h1 className="text-xl font-bold">Add Installer</h1>
      <InstallerForm
        initial={EMPTY_INSTALLER}
        locations={locations}
        currentLocationId={isAdmin ? adminLocFilter() : null}
        showLocationSelect={isAdmin && locations.length > 1}
      />
    </div>
  );
}
