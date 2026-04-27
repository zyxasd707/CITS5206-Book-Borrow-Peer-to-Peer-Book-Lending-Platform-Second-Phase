import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  
  allowedDevOrigins: [
    "https://www.bookborrow.org",
    "https://bookborrow.org",
  ],

  async headers() {
    return [
      {
        source: "/_next/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://www.bookborrow.org" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

export default nextConfig;

