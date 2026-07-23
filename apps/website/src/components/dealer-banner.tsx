import { dealerLogout } from "@/app/dealer/login/dealer-actions";
import type { DealerSession } from "@/lib/dealer-session";

/** Shown on catalog pages when a dealer is signed in (read-only portal Phase 1). */
export function DealerBanner({ session }: { session: DealerSession }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-white">
      <p className="text-xs">
        <span className="font-bold text-brand-light">{session.companyName}</span>
        <span className="ml-2 text-steel-300">dealer pricing &amp; live stock shown · prices are per tire, FOB warehouse</span>
      </p>
      <form action={dealerLogout}>
        <button className="text-xs font-bold text-steel-300 underline-offset-2 hover:text-white hover:underline">Sign out</button>
      </form>
    </div>
  );
}
