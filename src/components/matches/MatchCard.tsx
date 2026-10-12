'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatPrice } from '@/lib/utils'
import { PROPERTY_TYPE_LABELS } from '@/types'
import type { Match, Client } from '@/types'
import MatchStatusBadge from './MatchStatusBadge'
import WhatsAppButton from '@/components/inquiries/WhatsAppButton'
import EmailButton from '@/components/inquiries/EmailButton'
import { MapPin, BedDouble, Maximize2 } from 'lucide-react'

interface Props {
  match: Match
  client: Client
}

const scoreColor = (score: number) =>
  score >= 80 ? 'text-green-400 bg-green-500/15 border-green-500/25' :
  score >= 60 ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/25' :
               'text-red-400 bg-red-500/15 border-red-500/25'

export default function MatchCard({ match, client }: Props) {
  const property = match.property!
  const [status, setStatus] = useState(match.status)

  async function updateStatus(newStatus: typeof status) {
    setStatus(newStatus)
    await fetch(`/api/matches/${match.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  return (
    <div className="bg-[#141220] rounded-xl border border-[rgba(218,119,86,0.12)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/properties/${property.id}`}
            className="font-medium text-[#F5F1EB] hover:text-[#DA7756] transition-colors text-sm"
          >
            {property.title}
          </Link>
          <div className="flex items-center gap-1 text-xs text-[#9B9AAF] mt-0.5">
            <MapPin size={10} />
            {property.address}, {property.city}
          </div>
        </div>
        <div className={`shrink-0 text-sm font-bold px-2.5 py-1 rounded-full border ${scoreColor(match.score)}`}>
          {match.score}%
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-[#9B9AAF]">
        <span className="font-semibold text-[#DA7756]">{formatPrice(property.price)}</span>
        <span>{PROPERTY_TYPE_LABELS[property.type]}</span>
        {property.rooms && <span className="flex items-center gap-0.5"><BedDouble size={11} />{property.rooms}</span>}
        {property.size_sqm && <span className="flex items-center gap-0.5"><Maximize2 size={11} />{property.size_sqm}מ"ר</span>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <WhatsAppButton client={client} property={property} />
          <EmailButton client={client} property={property} />
        </div>

        <select
          value={status}
          onChange={(e) => updateStatus(e.target.value as typeof status)}
          className="text-xs px-2 py-1.5 rounded-lg bg-[#221F30] border border-[rgba(218,119,86,0.15)] text-[#9B9AAF] focus:outline-none focus:border-[#DA7756]"
        >
          <option value="suggested">מוצע</option>
          <option value="sent">נשלח</option>
          <option value="interested">מעוניין</option>
          <option value="rejected">נדחה</option>
        </select>
      </div>
    </div>
  )
}
