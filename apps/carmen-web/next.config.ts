import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pa/shared-types"],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
