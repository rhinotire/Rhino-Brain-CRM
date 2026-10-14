import { db } from "@/lib/db";
import { AccountSetupForm } from "@/components/account-setup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wholesale Account Application", robots: { index: false } };

/** Public tokenized account application — the customer fills it on their phone. */
export default async function AccountSetupPage({ params }: { params: { token: string } }) {
  const token = params.token.slice(0, 64);
  const invite = /^[0-9a-f]{48}$/.test(token)
    ? await db.accountSetupInvite.findUnique({
        where: { token },
        include: {
          customer: {
            select: {
              companyName: true, contactPerson: true, phone: true, contactCell: true, email: true,
              address: true, city: true, state: true, zip: true,
              location: { select: { name: true } },
            },
          },
        },
      })
    : null;

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-2 text-2xl">🛞</div>
      {children}
    </main>
  );

  if (!invite || invite.expiresAt < new Date()) {
    return shell(
      <div className="rounded-xl bg-amber-50 p-6">
        <div className="font-bold text-amber-800">This link is invalid or has expired.</div>
        <p className="mt-1 text-sm text-amber-700">Please ask your sales rep for a new one. / Pida a su representante un enlace nuevo.</p>
      </div>,
    );
  }
  if (invite.status === "SUBMITTED") {
    return shell(
      <div className="rounded-xl bg-green-50 p-6">
        <div className="font-bold text-green-800">✅ Already submitted — thank you!</div>
        <p className="mt-1 text-sm text-green-700">Your application is on file. / Su solicitud ya fue recibida.</p>
      </div>,
    );
  }

  // blank invite (sent before the customer exists) → empty form, brand from the invite's company
  const c = invite.customer;
  const brandName = c?.location?.name
    ?? (invite.locationId ? (await db.location.findUnique({ where: { id: invite.locationId }, select: { name: true } }))?.name : null)
    ?? "Rhino Tire USA";
  return shell(
    <>
      <h1 className="text-xl font-bold text-slate-900">{brandName} — Wholesale Account Application</h1>
      <p className="mt-1 text-sm text-slate-500">
        Takes about 3 minutes on your phone; your info goes securely to your sales rep.
        <span className="mt-1 block">Toma unos 3 minutos en su teléfono; su información llega de forma segura a su representante.</span>
      </p>
      <AccountSetupForm
        token={token}
        companyName={c?.companyName ?? ""}
        prefill={{
          contactPerson: c?.contactPerson ?? "", phone: c?.phone ?? "", cell: c?.contactCell ?? "",
          email: c?.email ?? "", address: c?.address ?? "", city: c?.city ?? "", state: c?.state ?? "", zip: c?.zip ?? "",
        }}
      />
    </>,
  );
}
