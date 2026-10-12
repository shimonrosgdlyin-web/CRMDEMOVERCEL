import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import MatchCard from '@/components/matches/MatchCard'
import RunMatchButton from '@/components/matches/RunMatchButton'
import type { Match, Client } from '@/types'
import Link from 'next/link'

export default async function MatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  const [{ data: clients }, { data: allMatches }] = await Promise.all([
    supabase.from('clients').select('*').eq('agent_id', user.id).eq('organization_id', currentOrgId).neq('status', 'closed').order('name'),
    supabase
      .from('property_client_matches')
      .select('*, property:properties(*), client:clients(*)')
      .eq('agent_id', user.id)
      .eq('organization_id', currentOrgId)
      .order('score', { ascending: false }),
  ])

  // Group matches by client
  const matchesByClient = (clients ?? []).map((client) => ({
    client,
    matches: (allMatches ?? []).filter((m) => m.client_id === client.id),
  }))

  return (
    <div className="flex flex-col flex-1">
      <TopNav title="שידוך נכסים" />

      <div className="p-6 space-y-6">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-5">
          <p className="text-sm text-[#9B9AAF]">
            מנוע השידוך מתאים נכסים ללקוחות לפי תקציב, סוג נכס, עיר ומספר חדרים.
            לחץ "הרץ שידוך" על לקוח ספציפי בדף הלקוח, או הרץ לכל הלקוחות כאן.
          </p>
        </div>

        {matchesByClient.map(({ client, matches }) => (
          <div key={client.id} className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Link
                  href={`/clients/${client.id}`}
                  className="font-semibold text-[#F5F1EB] hover:text-[#DA7756] transition-colors"
                >
                  {client.name}
                </Link>
                <p className="text-xs text-[#9B9AAF] mt-0.5">
                  {matches.length} שידוכים
                </p>
              </div>
              <RunMatchButton clientId={client.id} />
            </div>

            {matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(matches as Match[]).slice(0, 6).map((m) => (
                  <MatchCard key={m.id} match={m} client={client as Client} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6B6A7F]">
                לחץ "הרץ שידוך" כדי למצוא נכסים מתאימים
              </p>
            )}
          </div>
        ))}

        {matchesByClient.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#9B9AAF]">אין לקוחות פעילים</p>
            <Link href="/clients/new" className="text-[#DA7756] hover:underline text-sm mt-2 inline-block">
              הוסף לקוח ראשון
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
