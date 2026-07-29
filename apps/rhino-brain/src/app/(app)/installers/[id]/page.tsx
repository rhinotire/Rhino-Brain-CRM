import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, locationScope } from "@/lib/auth";
import { InstallerForm, type InstallerFormValues } from "@/components/installer-form";

export const dynamic = "force-dynamic";

export default async function EditInstallerPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!isManager(session)) redirect("/installers");

  const i = await db.installer.findFirst({ where: { id: params.id, ...locationScope(session) } });
  if (!i) notFound();

  const initial: InstallerFormValues = {
    id: i.id,
    storeName: i.storeName,
    legalName: i.legalName ?? "",
    phone: i.phone,
    email: i.email ?? "",
    notifyEmail: i.notifyEmail ?? "",
    website: i.website ?? "",
    address: i.address,
    city: i.city,
    state: i.state,
    zip: i.zip,
    serviceRadiusMi: i.serviceRadiusMi,
    preferredStatus: i.preferredStatus,
    customerId: i.customerId ?? "",
    passenger: i.passenger,
    lightTruck: i.lightTruck,
    trailer: i.trailer,
    tbr: i.tbr,
    wheels: i.wheels,
    mobileService: i.mobileService,
    appointmentEnabled: i.appointmentEnabled,
    sameDayEnabled: i.sameDayEnabled,
  };

  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-400">
        <Link href="/installers" className="hover:underline">Installers</Link> / {i.storeName}
      </nav>
      <h1 className="text-xl font-bold">Edit Installer</h1>
      <InstallerForm initial={initial} locations={[]} currentLocationId={null} showLocationSelect={false} />
    </div>
  );
}
