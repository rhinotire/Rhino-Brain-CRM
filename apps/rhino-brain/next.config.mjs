/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // document uploads (PDF / images) go through server actions
      bodySizeLimit: "10mb",
    },
  },
};
export default nextConfig;
