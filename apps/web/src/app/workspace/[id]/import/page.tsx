/**
 * Workspace Import Page
 * Import/upload functionality within workspace context
 */

import { ImportDashboard } from "@/components/import/import-dashboard"

interface Props {
  params: {
    id: string
  }
}

export default function WorkspaceImportPage({ params }: Props) {
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