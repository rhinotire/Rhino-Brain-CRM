/** @type {import('next').NextConfig} */
const nextConfig = {
  // Public tier: pages import @rhino/services only — never @rhino/database
  // directly (docs/architecture.md trust rule). database is transpiled because
  // services depends on it.
  transpilePackages: ["@rhino/database", "@rhino/services"],
  experimental: {
    serverActions: {
      // resale-certificate uploads (PDF / photos) go through server actions
      bodySizeLimit: "10mb",
    },
  },
};
export default nextConfig;
