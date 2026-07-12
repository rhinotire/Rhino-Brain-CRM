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
    // pnpm monorepo: make sure every route's function bundle carries the
    // Prisma query engine (some routes miss it in file tracing → 500s)
    outputFileTracingIncludes: {
      "*": ["../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node"],
    },
  },
};
export default nextConfig;
