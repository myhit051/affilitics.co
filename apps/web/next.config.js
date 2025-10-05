/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aff/db'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@supabase/supabase-js']
  },

  // Performance optimizations
  trailingSlash: false,
  compress: true,
  poweredByHeader: false,

  // Image optimization
  images: {
    domains: [],
    formats: ['image/webp', 'image/avif'],
  },

  // Docker/Coolify deployment
  output: 'standalone',

  // Skip TypeScript and ESLint checks in production build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
