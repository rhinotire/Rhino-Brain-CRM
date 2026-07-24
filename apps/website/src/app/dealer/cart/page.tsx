import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DealerBanner } from "@/components/dealer-banner";
import { DealerCartProvider, CartView } from "@/components/dealer-cart";
import { getDealerSession } from "@/lib/dealer-session";

export const metadata: Metadata = {
  title: "Cart — Dealer Portal",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function DealerCartPage() {
  const session = await getDealerSession();
  if (!session) redirect("/dealer/login");

  return (
    <div className="pt-6">
      <DealerBanner session={session} active="/dealer/cart" />
      <h1 className="mt-5 text-2xl font-black">Your Cart</h1>
      <DealerCartProvider>
        <CartView />
      </DealerCartProvider>
    </div>
  );
}
