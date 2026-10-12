import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import ClientStatusBadge from '@/components/clients/ClientStatusBadge'
import MatchCard from '@/components/matches/MatchCard'
import InquiryLog from '@/components/inquiries/InquiryLog'
import { formatPrice, formatDate } from '@/lib/utils'
import { Phone, Mail, MapPin, Pencil } from 'lucide-react'
import type { Client, Match, Inquiry } from '@/types'
import RunMatchButton from '@/components/matches/RunMatchButton'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  const [{ data: client }, { data: matches }, { data: inquiries }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).eq('agent_id', user.id).eq('organization_id', currentOrgId).single(),
    supabase
      .from('property_client_matches')
      .select('*, property:properties(*)')
      .eq('client_id', id)
      .eq('agent_id', user.id)
      .eq('organization_id', currentOrgId)
      .order('score', { ascending: false }),
    supabase
      .from('inquiries')
      .select('*, property:properties(title, address)')
      .eq('client_id', id)
      .eq('agent_id', user.id)
      .eq('organization_id', currentOrgId)
      .order('sent_at', { ascending: false })
      .limit(20),
  ])

  if (!client) notFound()

  return (
    <div className="flex flex-col flex-1">
      <TopNav title={client.name} />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client details */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-5">
            <div className="flex items-start justify-between mb-4">
              <ClientStatusBadge status={client.status} />
              <Link
                href={`/clients/${client.id}/edit`}
                className="p-1.5 rounded-lg hover:bg-[#DA7756]/10 text-[#9B9AAF] hover:text-[#DA7756] transition-colors"
              >
                <Pencil size={15} />
              </Link>
            </div>

            <h2 className="text-xl font-bold text-[#F5F1EB] mb-3">{client.name}</h2>

            <div className="space-y-2">
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-[#9B9AAF] hover:text-[#DA7756] transition-colors">
                  <Phone size={14} />
                  {client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-[#9B9AAF] hover:text-[#DA7756] transition-colors">
                  <Mail size={14} />
                  {client.email}
                </a>
              )}
            </div>

            {(client.budget_min || client.budget_max) && (
              <div className="mt-4 p-3 bg-[#141220] rounded-xl">
                <p className="text-xs text-[#9B9AAF] mb-1">תקציב</p>
                <p className="text-sm font-semibold text-[#DA7756]">
                  {client.budget_min ? formatPrice(client.budget_min) : '—'} –{' '}
                  {client.budget_max ? formatPrice(client.budget_max) : '—'}
                </p>
              </div>
            )}

            {client.preferred_cities.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[#9B9AAF] mb-1.5">ערים מועדפות</p>
                <div className="flex flex-wrap gap-1.5">
                  {client.preferred_cities.map((city: string) => (
                    <span key={city} className="flex items-center gap-1 text-xs bg-[#221F30] text-[#9B9AAF] px-2 py-1 rounded-lg border border-[rgba(218,119,86,0.1)]">
                      <MapPin size={10} />
                      {city}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {client.notes && (
              <div className="mt-4 p-3 bg-[#141220] rounded-xl">
                <p className="text-xs text-[#9B9AAF] mb-1">הערות</p>
                <p className="text-sm text-[#F5F1EB] whitespace-pre-line">{client.notes}</p>
              </div>
            )}

            <p className="text-xs text-[#6B6A7F] mt-4">נוצר: {formatDate(client.created_at)}</p>
          </div>

          {/* Inquiry log */}
          <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-5">
            <h3 className="font-semibold text-[#F5F1EB] mb-4">פניות</h3>
            <InquiryLog inquiries={(inquiries as Inquiry[]) ?? []} />
          </div>
        </div>

        {/* Matches */}
        <div className="lg:col-span-2">
          <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#F5F1EB]">
                נכסים מתאימים ({matches?.length ?? 0})
              </h3>
              <RunMatchButton clientId={client.id} />
            </div>

            {matches && matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(matches as Match[]).map((m) => (
                  <MatchCard key={m.id} match={m} client={client as Client} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-[#9B9AAF] text-sm mb-3">אין שידוכים עדיין</p>
                <p className="text-[#6B6A7F] text-xs">לחץ "הרץ שידוך" כדי למצוא נכסים מתאימים</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
