import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs"],
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
  },
};

export default nextConfig;
