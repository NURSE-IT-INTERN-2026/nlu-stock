import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
  },
  // pdfkit resolves its AFM font data via __dirname; Turbopack rewrites that to
  // /ROOT so Helvetica.afm goes missing (PDF export 500s). Keep it external so
  // Node resolves the real node_modules path.
  serverExternalPackages: ["pdfkit"],
  // E2E runs a second dev server (port 4517) alongside the dev server on 3000.
  // Give it a separate distDir so Next's single-instance dev lock doesn't trip.
  ...(process.env.E2E ? { distDir: ".next-e2e" } : {}),
};

export default nextConfig;
