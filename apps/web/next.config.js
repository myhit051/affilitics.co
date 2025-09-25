/** @type {import('next').NextConfig} */
const nextConfig = { 
  transpilePackages: ['@aff/db'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@supabase/supabase-js']
  },
  
  // Performance optimizations for Vercel
  trailingSlash: false,
  compress: true,
  poweredByHeader: false,
  
  // Image optimization
  images: {
    domains: [],
    formats: ['image/webp', 'image/avif'],
  }
};

export default nextConfig;
