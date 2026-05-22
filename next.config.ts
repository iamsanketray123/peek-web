import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Apple App Store artwork is served from *.mzstatic.com
    remotePatterns: [{ protocol: "https", hostname: "**.mzstatic.com" }],
  },
};

export default nextConfig;
