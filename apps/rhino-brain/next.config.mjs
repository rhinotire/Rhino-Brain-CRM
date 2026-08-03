/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rhino/database", "@rhino/services"],
  experimental: {
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
