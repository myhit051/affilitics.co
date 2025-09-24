/** @type {import('next').NextConfig} */
const nextConfig = { 
  transpilePackages: ['@aff/db'],
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  },
  // Disable static optimization for pages with dynamic content
  trailingSlash: false,
  // Skip build-time static generation for problematic pages
  generateBuildId: async () => {
    return 'affilitics-build'
  }
};

export default nextConfig;
