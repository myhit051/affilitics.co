/** @type {import('next').NextConfig} */
const nextConfig = { 
  transpilePackages: ['@aff/db'],
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@supabase/supabase-js']
  },
  
  // Disable static optimization to prevent build errors during deployment
  // This is a temporary workaround for React hooks issue
  staticPageGenerationTimeout: 1000,
  
  // Performance optimizations
  trailingSlash: false,
  compress: true,
  poweredByHeader: false,
  
  // Build optimizations
  generateBuildId: async () => {
    return `affilitics-${Date.now()}`
  },
  
  // Bundle analysis and optimization
  webpack: (config, { dev, isServer }) => {
    // Optimize bundle size
    if (!dev && !isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@prisma/client': '@prisma/client'
      }
    }
    
    return config
  },
  
  // Image optimization
  images: {
    domains: [],
    formats: ['image/webp', 'image/avif'],
  },
  
  // API route optimization
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300' }
        ]
      }
    ]
  },
  
  // Skip build static generation errors to allow deployment
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  }
};

export default nextConfig;
