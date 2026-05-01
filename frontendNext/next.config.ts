import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  // Phase A.7 (BRD v2.4 §17.3): /complain renamed to /supports-complaints.
  // Keep redirect for ~6 months (until ~2026-11) per Q6=B before removing.
  async redirects() {
    return [
      {
        source: "/complain",
        destination: "/supports-complaints",
        permanent: false,
      },
      {
        source: "/complain/:path*",
        destination: "/supports-complaints/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
