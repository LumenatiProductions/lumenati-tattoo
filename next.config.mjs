/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Legacy assets still served from the Squarespace CDN until the
    // asset-migration pass moves them into /public.
    remotePatterns: [
      { protocol: "https", hostname: "images.squarespace-cdn.com" },
    ],
  },
};

export default nextConfig;
