import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'], // native module - must not be bundled
  async headers() {
    return [
      {
        // allow the platform to be framed as a microfrontend by benebsworth.com
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://benebsworth.com https://*.benebsworth.com http://localhost:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
