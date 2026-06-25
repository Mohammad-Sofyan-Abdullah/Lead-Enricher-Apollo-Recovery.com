/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@rehab-leads/apollo",
    "@rehab-leads/cleaner",
    "@rehab-leads/exporter",
  ],
};

export default nextConfig;
