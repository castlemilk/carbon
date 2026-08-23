import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'], // native module - must not be bundled
};

export default nextConfig;
