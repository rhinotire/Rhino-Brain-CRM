import type { MetadataRoute } from "next";

/** PWA manifest — reps "Add to Home Screen" and the CRM opens like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rhino Brain CRM",
    short_name: "Rhino Brain",
    description: "AI business command center — Rhino Tire USA & Everflow",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      { src: "/icon-pwa.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/rhino-brain-logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
