// Force dynamic rendering to prevent build-time static generation issues
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/components/auth'
import { WorkspaceProvider } from '@/contexts/workspace-context'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Affilitics',
    template: '%s | Affilitics'
  },
  description: 'Advanced affiliate marketing analytics platform',
  keywords: ['affiliate marketing', 'analytics', 'performance tracking', 'commission tracking'],
  authors: [{ name: 'Affilitics Team' }],
  creator: 'Affilitics',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: './',
    title: 'Affilitics',
    description: 'Advanced affiliate marketing analytics platform',
    siteName: 'Affilitics'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Affilitics',
    description: 'Advanced affiliate marketing analytics platform'
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Security: Content Security Policy meta tag as fallback */}
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className={`${inter.className} h-full antialiased`}>
        <AuthProvider>
          <WorkspaceProvider>
            {children}
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  )
}