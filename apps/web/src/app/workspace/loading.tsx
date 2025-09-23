import { Loading } from '@/components/ui/loading'

export default function WorkspaceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-6">
      <div className="text-center space-y-6 max-w-md w-full">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Loading size="lg" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">Loading Workspace</h1>
            <p className="text-slate-600">Setting up your workspace dashboard...</p>
          </div>
        </div>
      </div>
    </div>
  )
}