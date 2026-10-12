import type { ClientStatus } from '@/types'
import { CLIENT_STATUS_LABELS } from '@/types'

const styles: Record<ClientStatus, string> = {
  new:       'bg-blue-500/15 text-blue-400 border-blue-500/25',
  contacted: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  meeting:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  offer:     'bg-orange-500/15 text-orange-400 border-orange-500/25',
  signed:    'bg-green-500/15 text-green-400 border-green-500/25',
  closed:    'bg-gray-500/15 text-gray-400 border-gray-500/25',
}

export default function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {CLIENT_STATUS_LABELS[status]}
    </span>
  )
}
