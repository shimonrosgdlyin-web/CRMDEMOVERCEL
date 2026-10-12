import { requirePlatformAdminPage } from '@/lib/admin/require-platform-admin'
import UserTable from '@/components/admin/UserTable'
import AdminSearchBox from '@/components/admin/AdminSearchBox'
import type { AdminUserRow } from '@/types'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search } = await searchParams
  const { supabase } = await requirePlatformAdminPage()

  const { data, error } = await supabase.rpc('admin_list_users', {
    search_term: search?.trim() || null,
    limit_count: 100,
    offset_count: 0,
  })

  const users = (data ?? []) as AdminUserRow[]

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-[rgba(78,168,222,0.15)] px-6 py-4">
        <h1 className="text-xl font-bold text-[#F5F1EB]">משתמשים</h1>
      </div>

      <div className="p-6 space-y-4">
        <AdminSearchBox placeholder="חיפוש לפי מייל או שם…" defaultValue={search ?? ''} />

        {error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400">
            טעינת הנתונים נכשלה: {error.message}
          </div>
        ) : (
          <UserTable users={users} />
        )}
      </div>
    </div>
  )
}
