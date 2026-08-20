import { ImageResponse } from "next/og";
import { COPY } from "@/lib/brand-copy";
import { SITE } from "@/lib/site";

/**
 * Site-wide share card (WhatsApp / Facebook / iMessage previews). Dealers pass
 * links around on WhatsApp all day — without this, a link shows as bare text.
 * Product pages with a real photo override it via their own openGraph.images.
 */
export const runtime = "edge";
export const alt = `${COPY.name} — Wholesale Tires, Wheels & Trailer Parts`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const KEY = process.env.NEXT_PUBLIC_BRAND_KEY ?? process.env.BRAND_KEY ?? "RHINO";
const GOLD = KEY === "EVERFLOW" ? "#EA8C1F" : "#F0A500";

export default function OgImage() {
  const host = SITE.url.replace(/^https?:\/\//, "");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #16213a 0%, #0a0f1e 60%, #101a30 100%)",
          padding: "0 90px",
          fontFamily: "sans-serif",
        }}
      >
        {/* left: wordmark + tagline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 14, height: 74, background: GOLD, borderRadius: 4 }} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                color: "white",
                fontSize: 76,
                fontWeight: 700,
                letterSpacing: 2,
                lineHeight: 1.05,
              }}
            >
              {COPY.name.toUpperCase()}
            </div>
          </div>
          <div style={{ marginTop: 34, color: GOLD, fontSize: 34, fontWeight: 700, letterSpacing: 6 }}>
            WHOLESALE TIRES · WHEELS · PARTS
          </div>
          <div style={{ marginTop: 18, color: "#94a3b8", fontSize: 28, letterSpacing: 2 }}>
            {COPY.heroTagline.split("·").slice(1).join("·").trim() || "USA"} · {host}
          </div>
          <div
            style={{
              marginTop: 40,
              display: "flex",
              alignItems: "center",
              color: "#0a0f1e",
              background: GOLD,
              fontSize: 28,
              fontWeight: 700,
              padding: "12px 28px",
              borderRadius: 10,
              letterSpacing: 1,
            }}
          >
            DEALER PRICING · {SITE.phoneDisplay}
          </div>
        </div>

        {/* right: tire built from rings */}
        <div
          style={{
            width: 340,
            height: 340,
            borderRadius: 999,
            background: "#05070d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 120px rgba(240,165,0,0.25)",
          }}
        >
          <div
            style={{
              width: 250,
              height: 250,
              borderRadius: 999,
              border: `6px solid ${GOLD}`,
              background: "#1b2436",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 170,
                height: 170,
                borderRadius: 999,
                background: "linear-gradient(145deg, #e2e8f0, #64748b)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 999,
                  background: "#0a0f1e",
                  border: `4px solid ${GOLD}`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
