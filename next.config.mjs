/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  allowedDevOrigins: [
    "http://localhost",
    "http://localhost:3000",
    "http://192.168.168.220",
    "http://192.168.168.220:3000",
    "http://192.168.168.219",
    "http://192.168.168.219:3000",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
