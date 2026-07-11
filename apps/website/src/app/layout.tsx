import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header, Footer, MobileBar } from "@/components/chrome";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Rhino Tire USA — Wholesale Tires, Wheels & Trailer Parts",
    template: "%s | Rhino Tire USA",
  },
  description: SITE.description,
  openGraph: { siteName: SITE.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID;
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: SITE.name,
                legalName: SITE.legalName,
                url: SITE.url,
                telephone: SITE.phone,
                address: { "@type": "PostalAddress", ...SITE.address },
              },
              {
                "@type": "WebSite",
                name: SITE.name,
                url: SITE.url,
                potentialAction: {
                  "@type": "SearchAction",
                  target: `${SITE.url}/tires?q={search_term_string}`,
                  "query-input": "required name=search_term_string",
                },
              },
            ],
          }}
        />
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16">{children}</main>
        <Footer />
        <MobileBar />
        {GA4_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}');`}
            </Script>
          </>
        )}
        {CLARITY_ID && (
          <Script id="clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`}
          </Script>
        )}
      </body>
    </html>
  );
}
