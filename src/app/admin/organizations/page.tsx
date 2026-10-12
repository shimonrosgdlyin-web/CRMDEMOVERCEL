import { requirePlatformAdminPage } from '@/lib/admin/require-platform-admin'
import OrgTable from '@/components/admin/OrgTable'
import AdminSearchBox from '@/components/admin/AdminSearchBox'
import type { AdminOrganizationRow } from '@/types'

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  // Next.js 16 — searchParams is a Promise.
  const { search } = await searchParams
  const { supabase } = await requirePlatformAdminPage()

  const { data, error } = await supabase.rpc('admin_list_organizations', {
    // Trimmed to null rather than passed as '' so the RPC's `search_term is
    // null` branch (return everything) is what runs for an empty box.
    search_term: search?.trim() || null,
    limit_count: 100,
    offset_count: 0,
  })

  const organizations = (data ?? []) as AdminOrganizationRow[]

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-[rgba(78,168,222,0.15)] px-6 py-4">
        <h1 className="text-xl font-bold text-[#F5F1EB]">ארגונים</h1>
      </div>

      <div className="p-6 space-y-4">
        <AdminSearchBox placeholder="חיפוש לפי שם ארגון…" defaultValue={search ?? ''} />

        {error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400">
            טעינת הנתונים נכשלה: {error.message}
          </div>
        ) : (
          <OrgTable organizations={organizations} />
        )}
      </div>
    </div>
  )
}
