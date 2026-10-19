import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@recall/contracts'],
  typedRoutes: false,
};

export default nextConfig;
