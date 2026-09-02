/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Y2K assets and Winamp tracks are frozen files — let browsers and the
  // CDN keep them for a year instead of re-asking on every visit.
  // Old Squarespace URLs that have no twin here.
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/waiver", destination: "/contact", permanent: true },
      // Flash wall is off until real flash is pinned (Scott, 2026-09-02): the
      // page was showing the pieces we tested with. Temporary on purpose.
      { source: "/flash-wall", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:prefix(legacy-assets|audio)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  images: {
    // Legacy assets still served from the Squarespace CDN until the
    // asset-migration pass moves them into /public.
    remotePatterns: [
      { protocol: "https", hostname: "images.squarespace-cdn.com" },
    ],
  },
};

export default nextConfig;
