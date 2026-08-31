import type { NextConfig } from "next";

const productionParentOrigin = 'https://benebsworth.com';
const rawParentOrigin = process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN;
let parentOrigin: string | undefined;

if (rawParentOrigin) {
  try {
    const parsed = new URL(rawParentOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol');
    parentOrigin = parsed.origin;
  } catch {
    throw new Error('NEXT_PUBLIC_EMBED_PARENT_ORIGIN must be a valid HTTP(S) origin');
  }
}

if (process.env.NODE_ENV === 'production' && parentOrigin !== productionParentOrigin) {
  throw new Error(`NEXT_PUBLIC_EMBED_PARENT_ORIGIN must equal ${productionParentOrigin} for production builds`);
}

const frameAncestors = process.env.NODE_ENV === 'production'
  ? productionParentOrigin
  : `'self' ${parentOrigin ?? 'http://localhost:4321'} http://localhost:*`;

const nextConfig: NextConfig = {
  // self-contained server bundle for the container image (cluster deploys)
  output: "standalone",
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
               `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
