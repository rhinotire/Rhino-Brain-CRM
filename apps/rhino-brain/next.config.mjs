/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rhino/database", "@rhino/services"],
  // No next/image anywhere (raw <img> by design) — disabling the optimizer
  // closes the /_next/image endpoint entirely (GHSA-2xp9-vwfh-vxw4 AVIF RCE).
  images: { unoptimized: true },
  experimental: {
    // @react-pdf/renderer must run un-bundled in the Node runtime (server-side PDF generation)
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
    serverActions: {
      // document uploads (PDF / images) go through server actions
      bodySizeLimit: "10mb",
    },
    // hr-templates route reads these at runtime; without tracing Vercel drops them
    outputFileTracingIncludes: {
      "/api/hr-templates/[file]": ["./files/hr-templates/*"],
    },
  },
};
export default nextConfig;
