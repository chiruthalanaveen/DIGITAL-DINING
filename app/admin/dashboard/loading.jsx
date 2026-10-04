export default function AdminDashboardLoading() {
  return (
    <main className="min-h-[100dvh] bg-neutral-950 p-6 text-white">
      <div className="mx-auto flex min-h-[70dvh] max-w-lg items-center justify-center">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center">
          <p className="text-sm font-black">
            Opening Admin Dashboard...
          </p>

          <p className="mt-2 text-[10px] text-neutral-500">
            Route: /admin/dashboard
          </p>
        </div>
      </div>
    </main>
  )
}
