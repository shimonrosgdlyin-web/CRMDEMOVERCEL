import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformAdminPage } from '@/lib/admin/require-platform-admin'
import SuspensionBadge from '@/components/admin/SuspensionBadge'
import SuspendButton from '@/components/admin/SuspendButton'
import { formatDate } from '@/lib/utils'
import { ORGANIZATION_MEMBER_ROLE_LABELS, type AdminOrganizationDetailRow } from '@/types'
import { ArrowRight } from 'lucide-react'

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await requirePlatformAdminPage()

  const { data, error } = await supabase.rpc('admin_get_organization', { target_org_id: id })
  const rows = (data ?? []) as AdminOrganizationDetailRow[]

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400">
          טעינת הנתונים נכשלה: {error.message}
        </div>
      </div>
    )
  }

  if (rows.length === 0) notFound()

  // The RPC returns a flat join: org columns repeat on every member row, and a
  // memberless org comes back as a single row with null member_* columns.
  const org = rows[0]
  const members = rows.filter((r) => r.member_user_id !== null)

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-[rgba(78,168,222,0.15)] px-6 py-4 flex items-center gap-3">
        <Link
          href="/admin/organizations"
          className="p-1.5 rounded-lg text-[#9B9AAF] hover:text-[#F5F1EB] hover:bg-[#221F30] transition-colors"
        >
          <ArrowRight size={16} />
        </Link>
        <h1 className="text-xl font-bold text-[#F5F1EB]">{org.organization_name}</h1>
        <SuspensionBadge suspendedAt={org.suspended_at} />
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 text-sm">
              <p className="text-[#9B9AAF]">
                נוצר: <span className="text-[#F5F1EB]">{formatDate(org.created_at)}</span>
              </p>
              <p className="text-[#9B9AAF]">
                חברים: <span className="text-[#F5F1EB]">{members.length}</span>
              </p>
              {org.suspended_at && (
                <>
                  <p className="text-red-400">הושעה: {formatDate(org.suspended_at)}</p>
                  {org.suspension_reason && (
                    <p className="text-red-400/80">סיבה: {org.suspension_reason}</p>
                  )}
                </>
              )}
            </div>

            <SuspendButton
              targetType="organization"
              targetId={org.organization_id}
              targetLabel={org.organization_name}
              isSuspended={Boolean(org.suspended_at)}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-[#9B9AAF] mb-3">חברי הארגון</h2>

          {members.length === 0 ? (
            <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-12 text-center">
              <p className="text-[#9B9AAF]">לארגון הזה אין חברים</p>
            </div>
          ) : (
            <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[rgba(78,168,222,0.1)] bg-[#141220]/50">
                      {['שם', 'מייל', 'תפקיד', 'סטטוס', 'הצטרף'].map((h) => (
                        <th
                          key={h}
                          className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(78,168,222,0.08)]">
                    {members.map((m) => (
                      <tr key={m.member_user_id} className="hover:bg-[#221F30]/40 transition-colors">
                        <td className="px-4 py-3 text-sm text-[#F5F1EB]">
                          {m.member_full_name || <span className="text-[#6B6A7F]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                          {m.member_email || <span className="text-[#6B6A7F]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                          {m.member_role
                            ? ORGANIZATION_MEMBER_ROLE_LABELS[m.member_role]
                            : <span className="text-[#6B6A7F]">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <SuspensionBadge suspendedAt={m.member_suspended_at} />
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6B6A7F]">
                          {m.member_joined_at ? formatDate(m.member_joined_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
