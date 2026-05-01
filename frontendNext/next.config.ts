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

  // Legacy URL retirement (BRD v2.4 §8.4 + §17.3, Q6=B). Each redirect adds
  // ?from=legacy so analytics can track residual traffic. Sunset target:
  // 2026-11-01 (~6 months after the Phase A 2026-05-01 launch). Detail
  // pages (/refunds/[id], /deposits/[orderId], /supports-complaints/[id])
  // are intentionally not redirected — they remain the canonical drill-down
  // targets and the source patterns below are exact-match.
  async redirects() {
    return [
      // A.7: /complain → /supports-complaints (renamed for clarity).
      {
        source: "/complain",
        destination: "/supports-complaints?from=legacy",
        permanent: false,
      },
      {
        source: "/complain/:path*",
        destination: "/supports-complaints/:path*?from=legacy",
        permanent: false,
      },
      // A.5: legacy list pages collapse into the unified /activity hub.
      // Land users on the Active tab — that's where their in-flight refund
      // and deposit cases live.
      {
        source: "/refunds",
        destination: "/activity?tab=active&from=legacy",
        permanent: false,
      },
      {
        source: "/deposits",
        destination: "/activity?tab=active&from=legacy",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
