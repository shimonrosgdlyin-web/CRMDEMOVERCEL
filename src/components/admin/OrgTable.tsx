import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import SuspensionBadge from './SuspensionBadge'
import SuspendButton from './SuspendButton'
import type { AdminOrganizationRow } from '@/types'

export default function OrgTable({ organizations }: { organizations: AdminOrganizationRow[] }) {
  if (organizations.length === 0) {
    return (
      <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-12 text-center">
        <p className="text-[#9B9AAF]">לא נמצאו ארגונים</p>
      </div>
    )
  }

  return (
    <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(78,168,222,0.1)] bg-[#141220]/50">
              {['ארגון', 'חברים', 'נכסים', 'לקוחות', 'פניות', 'סטטוס', 'נוצר', 'פעילות אחרונה', ''].map((h, i) => (
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
            {organizations.map((org) => (
              <tr key={org.id} className="hover:bg-[#221F30]/40 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="font-medium text-[#F5F1EB] hover:text-[#4EA8DE] transition-colors"
                  >
                    {org.name}
                  </Link>
                  {org.suspension_reason && (
                    <div className="text-xs text-red-400/80 mt-0.5">{org.suspension_reason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">{org.member_count}</td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">{org.property_count}</td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">{org.client_count}</td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">{org.inquiry_count}</td>
                <td className="px-4 py-3">
                  <SuspensionBadge suspendedAt={org.suspended_at} />
                </td>
                <td className="px-4 py-3 text-xs text-[#6B6A7F]">{formatDate(org.created_at)}</td>
                <td className="px-4 py-3 text-xs text-[#6B6A7F]">
                  {org.last_activity_at ? formatDate(org.last_activity_at) : <span className="text-[#6B6A7F]">—</span>}
                </td>
                <td className="px-4 py-3">
                  <SuspendButton
                    targetType="organization"
                    targetId={org.id}
                    targetLabel={org.name}
                    isSuspended={Boolean(org.suspended_at)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
