import type { NextConfig } from "next";

const PY_BACKEND_URL = process.env.PY_BACKEND_URL ?? "http://localhost:8001";
const JAVA_BACKEND_URL = process.env.JAVA_BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/estimator/:path*",
        destination: `${PY_BACKEND_URL}/api/estimator/:path*`,
      },
      {
        source: "/api/market/:path*",
        destination: `${JAVA_BACKEND_URL}/api/market/:path*`,
      },
    ];
  },
};

export default nextConfig;