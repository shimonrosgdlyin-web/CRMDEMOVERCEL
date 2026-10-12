import { formatDate } from '@/lib/utils'
import SuspensionBadge from './SuspensionBadge'
import SuspendButton from './SuspendButton'
import type { AdminUserRow } from '@/types'
import { ShieldCheck } from 'lucide-react'

export default function UserTable({ users }: { users: AdminUserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-12 text-center">
        <p className="text-[#9B9AAF]">לא נמצאו משתמשים</p>
      </div>
    )
  }

  return (
    <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(78,168,222,0.1)] bg-[#141220]/50">
              {['משתמש', 'ארגונים', 'סטטוס', 'נרשם', 'כניסה אחרונה', ''].map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(78,168,222,0.08)]">
            {users.map((u) => (
              <tr key={u.user_id} className="hover:bg-[#221F30]/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#F5F1EB]">
                      {u.full_name || <span className="text-[#6B6A7F]">ללא שם</span>}
                    </span>
                    {u.is_admin && (
                      <span
                        title="אדמין פלטפורמה"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-medium bg-[#4EA8DE]/15 text-[#4EA8DE]"
                      >
                        <ShieldCheck size={10} />
                        אדמין
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#6B6A7F] mt-0.5">{u.email ?? '—'}</div>
                  {u.suspension_reason && (
                    <div className="text-xs text-red-400/80 mt-0.5">{u.suspension_reason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">{u.org_count}</td>
                <td className="px-4 py-3">
                  <SuspensionBadge suspendedAt={u.suspended_at} />
                </td>
                <td className="px-4 py-3 text-xs text-[#6B6A7F]">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3 text-xs text-[#6B6A7F]">
                  {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : <span className="text-[#6B6A7F]">—</span>}
                </td>
                <td className="px-4 py-3">
                  {/*
                    A platform admin gets no suspend control at all. The database
                    refuses it regardless (admin_set_user_suspended raises on any
                    platform_admins holder — that is what makes mutual operator
                    lockout impossible), so rendering a button that can only ever
                    fail would be a lie about what the product does.
                  */}
                  {u.is_admin ? (
                    <span className="text-xs text-[#6B6A7F]">—</span>
                  ) : (
                    <SuspendButton
                      targetType="user"
                      targetId={u.user_id}
                      targetLabel={u.full_name || u.email || u.user_id}
                      isSuspended={Boolean(u.suspended_at)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
