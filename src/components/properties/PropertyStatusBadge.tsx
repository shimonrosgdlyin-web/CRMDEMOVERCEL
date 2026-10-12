import type { PropertyStatus } from '@/types'
import { PROPERTY_STATUS_LABELS } from '@/types'

const styles: Record<PropertyStatus, string> = {
  available: 'bg-green-500/15 text-green-400 border-green-500/25',
  pending:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  rented:    'bg-blue-500/15 text-blue-400 border-blue-500/25',
  sold:      'bg-gray-500/15 text-gray-400 border-gray-500/25',
}

export default function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {PROPERTY_STATUS_LABELS[status]}
    </span>
  )
}
