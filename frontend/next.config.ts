import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @groweasy/shared is a source-only TypeScript workspace package, so Next must transpile it
  // rather than expect pre-built JavaScript.
  transpilePackages: ['@groweasy/shared'],

  // Emits a self-contained server bundle for the Docker image, so the runtime stage does not need
  // node_modules or the monorepo around it.
  output: 'standalone',
};

export default nextConfig;
