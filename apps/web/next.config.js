/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aff/db'],
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', 'drizzle-orm', '@supabase/supabase-js']
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

  // Skip TypeScript and ESLint checks in production build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
