/**
 * Import Dashboard Page
 * Complete import/upload functionality for affiliate marketing data
 */

import { ImportDashboard } from "@/components/import/import-dashboard"

export default function ImportPage() {
  return (
    <div className="container max-w-7xl mx-auto py-6">
      <ImportDashboard />
    </div>
  )
}

export const metadata = {
  title: "Import & Upload | Affilitics",
  description: "Import and manage your affiliate marketing data from Shopee, Lazada, and TikTok"
}