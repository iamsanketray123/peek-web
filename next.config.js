/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Apple App Store artwork is served from *.mzstatic.com
    remotePatterns: [
      // Apple App Store artwork (various is*.mzstatic.com subdomains)
      { protocol: "https", hostname: "*.mzstatic.com", port: "", pathname: "/**" },
    ],
  },
};

module.exports = nextConfig;
