import { db } from "@/lib/db";
import { OnboardingForm } from "@/components/onboarding-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Hire Form", robots: { index: false } };

/** Public tokenized onboarding form — the employee fills this on their phone. */
export default async function OnboardPage({ params }: { params: { token: string } }) {
  const token = params.token.slice(0, 64);
  const invite = /^[0-9a-f]{48}$/.test(token)
    ? await db.onboardingInvite.findUnique({
        where: { token },
        include: { employee: { select: { name: true, location: { select: { name: true } } } } },
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
        <p className="mt-1 text-sm text-amber-700">Please ask your manager to send you a new one. / Pida a su gerente un enlace nuevo.</p>
      </div>,
    );
  }
  if (invite.status === "SUBMITTED") {
    return shell(
      <div className="rounded-xl bg-green-50 p-6">
        <div className="font-bold text-green-800">✅ Already submitted — thank you!</div>
        <p className="mt-1 text-sm text-green-700">Your form is on file. / Su formulario ya fue recibido.</p>
      </div>,
    );
  }

  return shell(
    <>
      <h1 className="text-xl font-bold text-slate-900">Welcome to {invite.employee.location.name}!</h1>
      <p className="mt-1 text-sm text-slate-500">
        {invite.employee.name} — please fill out this form on your phone. It takes about 3 minutes and goes directly to HR, securely.
        <span className="mt-1 block">Complete este formulario en su teléfono. Toma unos 3 minutos y se envía directamente a Recursos Humanos de forma segura.</span>
      </p>
      <OnboardingForm token={token} employeeName={invite.employee.name} companyName={invite.employee.location.name} />
    </>,
  );
}
