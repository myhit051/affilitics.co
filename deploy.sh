#!/bin/bash

# Affilitics Vercel Deployment Script
echo "🚀 Starting Affilitics deployment to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Make sure to set environment variables in Vercel dashboard"
fi

echo "📦 Installing dependencies..."
pnpm install

echo "🔧 Building the project..."
cd apps/web && pnpm build
cd ../..

echo "🌐 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Set up environment variables in Vercel dashboard"
echo "2. Configure your custom domain (optional)"
echo "3. Test the deployment"
echo ""
echo "🔗 Environment variables needed:"
echo "   - DATABASE_URL"
echo "   - NEXT_PUBLIC_SUPABASE_URL"
echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "   - SUPABASE_JWT_SECRET"
echo "   - NEXTAUTH_SECRET"
echo "   - NEXTAUTH_URL"
echo "   - APP_ORIGIN"