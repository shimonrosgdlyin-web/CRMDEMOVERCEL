import Link from 'next/link'
import type { Client } from '@/types'
import { formatPrice } from '@/lib/utils'
import { Phone, Banknote } from 'lucide-react'

interface Props {
  client: Client
  onDragStart: () => void
}

export default function KanbanCard({ client, onDragStart }: Props) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-[#1A1825] rounded-xl border border-[rgba(218,119,86,0.12)] p-3 cursor-grab active:cursor-grabbing hover:border-[#DA7756]/25 transition-colors select-none"
    >
      <Link
        href={`/clients/${client.id}`}
        draggable={false}
        className="font-medium text-sm text-[#F5F1EB] hover:text-[#DA7756] transition-colors block mb-1.5"
      >
        {client.name}
      </Link>

      <div className="space-y-1">
        {client.phone && (
          <div className="flex items-center gap-1 text-xs text-[#9B9AAF]">
            <Phone size={10} />
            {client.phone}
          </div>
        )}
        {(client.budget_min || client.budget_max) && (
          <div className="flex items-center gap-1 text-xs text-[#9B9AAF]">
            <Banknote size={10} />
            {client.budget_max
              ? `עד ${formatPrice(client.budget_max)}`
              : `מ- ${formatPrice(client.budget_min!)}`}
          </div>
        )}
        {client.preferred_cities.length > 0 && (
          <p className="text-xs text-[#6B6A7F] truncate">
            📍 {client.preferred_cities.slice(0, 2).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}
