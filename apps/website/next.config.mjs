/** @type {import('next').NextConfig} */
const nextConfig = {
  // Public tier: pages import @rhino/services only — never @rhino/database
  // directly (docs/architecture.md trust rule). database is transpiled because
  // services depends on it.
  transpilePackages: ["@rhino/database", "@rhino/services"],
};
export default nextConfig;
