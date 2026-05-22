/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Apple App Store artwork is served from *.mzstatic.com
    remotePatterns: [{ protocol: "https", hostname: "**.mzstatic.com" }],
  },
};

module.exports = nextConfig;
