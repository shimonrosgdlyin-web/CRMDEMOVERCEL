import Link from 'next/link'
import { formatPrice, formatDate } from '@/lib/utils'
import { PROPERTY_TYPE_LABELS } from '@/types'
import PropertyStatusBadge from './PropertyStatusBadge'
import type { Property } from '@/types'
import { Pencil, MapPin } from 'lucide-react'

export default function PropertyTable({ properties }: { properties: Property[] }) {
  if (properties.length === 0) {
    return (
      <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-12 text-center">
        <p className="text-[#9B9AAF]">לא נמצאו נכסים</p>
      </div>
    )
  }

  return (
    <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(218,119,86,0.1)] bg-[#141220]/50">
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                נכס
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                סוג
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                עיר
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                מחיר
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                חדרים
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                סטטוס
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                תאריך
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(218,119,86,0.08)]">
            {properties.map((p) => (
              <tr key={p.id} className="hover:bg-[#221F30]/40 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/properties/${p.id}`}
                    className="font-medium text-[#F5F1EB] hover:text-[#DA7756] transition-colors"
                  >
                    {p.title}
                  </Link>
                  <div className="flex items-center gap-1 text-xs text-[#6B6A7F] mt-0.5">
                    <MapPin size={10} />
                    <span className="line-clamp-1">{p.address}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                  {PROPERTY_TYPE_LABELS[p.type]}
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">{p.city}</td>
                <td className="px-4 py-3 text-sm font-semibold text-[#DA7756]">
                  {formatPrice(p.price)}
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                  {p.rooms ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <PropertyStatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-xs text-[#6B6A7F]">
                  {formatDate(p.created_at)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/properties/${p.id}/edit`}
                    className="p-1.5 rounded-lg hover:bg-[#DA7756]/10 text-[#9B9AAF] hover:text-[#DA7756] transition-colors inline-flex"
                  >
                    <Pencil size={14} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
