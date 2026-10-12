import Link from 'next/link'
import { formatPrice, formatDate } from '@/lib/utils'
import ClientStatusBadge from './ClientStatusBadge'
import type { Client } from '@/types'
import { Pencil, Phone, Mail } from 'lucide-react'

export default function ClientTable({ clients }: { clients: Client[] }) {
  if (clients.length === 0) {
    return (
      <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-12 text-center">
        <p className="text-[#9B9AAF]">לא נמצאו לקוחות</p>
      </div>
    )
  }

  return (
    <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(218,119,86,0.1)] bg-[#141220]/50">
              {['שם', 'טלפון', 'תקציב', 'ערים מועדפות', 'סטטוס', 'תאריך', ''].map((h) => (
                <th key={h} className="text-start px-4 py-3 text-xs font-medium text-[#9B9AAF] uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(218,119,86,0.08)]">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-[#221F30]/40 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium text-[#F5F1EB] hover:text-[#DA7756] transition-colors">
                    {c.name}
                  </Link>
                  {c.email && (
                    <div className="flex items-center gap-1 text-xs text-[#6B6A7F] mt-0.5">
                      <Mail size={10} />
                      {c.email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.phone ? (
                    <span className="flex items-center gap-1 text-sm text-[#9B9AAF]">
                      <Phone size={12} />
                      {c.phone}
                    </span>
                  ) : <span className="text-[#6B6A7F]">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                  {c.budget_min || c.budget_max ? (
                    <span>
                      {c.budget_min ? formatPrice(c.budget_min) : ''}
                      {c.budget_min && c.budget_max ? ' – ' : ''}
                      {c.budget_max ? formatPrice(c.budget_max) : ''}
                    </span>
                  ) : <span className="text-[#6B6A7F]">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-[#9B9AAF]">
                  {c.preferred_cities.length > 0
                    ? c.preferred_cities.slice(0, 2).join(', ') + (c.preferred_cities.length > 2 ? '...' : '')
                    : <span className="text-[#6B6A7F]">—</span>}
                </td>
                <td className="px-4 py-3">
                  <ClientStatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-xs text-[#6B6A7F]">
                  {formatDate(c.created_at)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${c.id}/edit`}
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
