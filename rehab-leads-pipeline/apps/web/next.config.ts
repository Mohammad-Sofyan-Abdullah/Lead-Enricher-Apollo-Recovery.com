import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@rehab-leads/apollo",
    "@rehab-leads/cleaner",
    "@rehab-leads/exporter",
  ],
};

export default nextConfig;
