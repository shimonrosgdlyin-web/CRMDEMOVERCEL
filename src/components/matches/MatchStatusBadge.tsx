import type { MatchStatus } from '@/types'
import { MATCH_STATUS_LABELS } from '@/types'

const styles: Record<MatchStatus, string> = {
  suggested:  'bg-[#9B9AAF]/10 text-[#9B9AAF] border-[#9B9AAF]/20',
  sent:       'bg-blue-500/15 text-blue-400 border-blue-500/25',
  interested: 'bg-green-500/15 text-green-400 border-green-500/25',
  rejected:   'bg-red-500/15 text-red-400 border-red-500/25',
}

export default function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {MATCH_STATUS_LABELS[status]}
    </span>
  )
}
