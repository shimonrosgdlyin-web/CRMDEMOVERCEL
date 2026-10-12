import { requirePlatformAdminPage } from '@/lib/admin/require-platform-admin'
import AuditLogTable from '@/components/admin/AuditLogTable'
import type { AdminAuditLogEntry } from '@/types'

export default async function AdminAuditLogPage() {
  const { supabase } = await requirePlatformAdminPage()

  // Queried directly rather than through an RPC: admin_audit_log already
  // carries an is_platform_admin()-gated SELECT policy, so PostgREST's own
  // ordering and pagination are safe to use here.
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, actor_id, actor_email, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const entries = (data ?? []) as AdminAuditLogEntry[]

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-[rgba(78,168,222,0.15)] px-6 py-4">
        <h1 className="text-xl font-bold text-[#F5F1EB]">יומן פעולות</h1>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-sm text-[#9B9AAF]">
          כל פעולת השעיה או שחזור נרשמת כאן אוטומטית, מתוך אותה טרנזקציה שביצעה אותה — פעולה
          ללא רישום אינה אפשרית.
        </p>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400">
            טעינת הנתונים נכשלה: {error.message}
          </div>
        ) : (
          <AuditLogTable entries={entries} />
        )}
      </div>
    </div>
  )
}
