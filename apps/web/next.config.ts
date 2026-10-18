import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@straume/domain", "@straume/db"],
  poweredByHeader: false,
  agentRules: false,
};

export default nextConfig;
