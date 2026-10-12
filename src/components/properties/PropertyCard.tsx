import Link from 'next/link'
import { Building2, MapPin, BedDouble, Maximize2, Car } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { PROPERTY_TYPE_LABELS } from '@/types'
import PropertyStatusBadge from './PropertyStatusBadge'
import type { Property } from '@/types'

export default function PropertyCard({ property: p }: { property: Property }) {
  return (
    <Link
      href={`/properties/${p.id}`}
      className="block bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] hover:border-[#DA7756]/40 transition-all hover:shadow-lg hover:shadow-[#DA7756]/5 group"
    >
      {/* Image placeholder */}
      <div className="h-44 rounded-t-2xl bg-[#221F30] flex items-center justify-center">
        <Building2 size={40} className="text-[#6B6A7F] group-hover:text-[#DA7756]/40 transition-colors" />
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <PropertyStatusBadge status={p.status} />
          <span className="text-xs text-[#9B9AAF]">{PROPERTY_TYPE_LABELS[p.type]}</span>
        </div>

        <h3 className="font-semibold text-[#F5F1EB] mb-1 line-clamp-1">{p.title}</h3>

        <div className="flex items-center gap-1 text-[#9B9AAF] text-sm mb-3">
          <MapPin size={13} />
          <span className="line-clamp-1">{p.address}, {p.city}</span>
        </div>

        <p className="text-xl font-bold text-[#DA7756] mb-3">{formatPrice(p.price)}</p>

        <div className="flex items-center gap-3 text-[#9B9AAF] text-xs">
          {p.rooms && (
            <span className="flex items-center gap-1">
              <BedDouble size={12} />
              {p.rooms} חד'
            </span>
          )}
          {p.size_sqm && (
            <span className="flex items-center gap-1">
              <Maximize2 size={12} />
              {p.size_sqm} מ"ר
            </span>
          )}
          {p.parking && (
            <span className="flex items-center gap-1">
              <Car size={12} />
              חניה
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
