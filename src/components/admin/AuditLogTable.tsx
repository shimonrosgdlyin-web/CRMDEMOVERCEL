import { formatDate } from '@/lib/utils'
import {
  ADMIN_AUDIT_ACTION_LABELS,
  ADMIN_AUDIT_TARGET_TYPE_LABELS,
  type AdminAuditLogEntry,
} from '@/types'

const isSuspendAction = (action: AdminAuditLogEntry['action']) => action.endsWith('.suspend')

export default function AuditLogTable({ entries }: { entries: AdminAuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-12 text-center">
        <p className="text-[#9B9AAF]">לא בוצעו פעולות ניהול עדיין</p>
      </div>
    )
  }

  return (
    <div className="bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(78,168,222,0.1)] bg-[#141220]/50">
              {['מתי', 'מי', 'פעולה', 'יעד', 'סיבה'].map((h) => (
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
            {entries.map((e) => {
              // metadata is jsonb — treat every field in it as untyped and
              // coerce defensively rather than trusting a shape.
              const reason = typeof e.metadata?.reason === 'string' ? e.metadata.reason : null

              return (
                <tr key={e.id} className="hover:bg-[#221F30]/40 transition-colors">
                  <td className="px-4 py-3 text-xs text-[#6B6A7F] whitespace-nowrap">
                    {formatDate(e.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#9B9AAF]">{e.actor_email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        isSuspendAction(e.action)
                          ? 'inline-block px-2 py-0.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400'
                          : 'inline-block px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400'
                      }
                    >
                      {ADMIN_AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#9B9AAF]">
                    <span className="text-[#6B6A7F]">
                      {ADMIN_AUDIT_TARGET_TYPE_LABELS[e.target_type] ?? e.target_type}
                    </span>
                    <span className="block font-mono text-[10px] text-[#6B6A7F]">{e.target_id}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                    {reason || <span className="text-[#6B6A7F]">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
