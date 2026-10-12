import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import StatCard from '@/components/dashboard/StatCard'
import ActivityFeed from '@/components/dashboard/ActivityFeed'
import TopNav from '@/components/layout/TopNav'
import { Building2, Users, Link2, CheckCircle } from 'lucide-react'
import type { Inquiry } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalProperties },
    { count: activeClients },
    { count: matchesThisWeek },
    { count: closedDeals },
    { data: recentInquiries },
  ] = await Promise.all([
    // properties are org-shared (Stage 2) — org-wide count, not "listed by me"
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('organization_id', currentOrgId),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('agent_id', user.id).eq('organization_id', currentOrgId).neq('status', 'closed'),
    supabase.from('property_client_matches').select('*', { count: 'exact', head: true }).eq('agent_id', user.id).eq('organization_id', currentOrgId).gte('created_at', weekAgo),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('agent_id', user.id).eq('organization_id', currentOrgId).in('status', ['signed', 'closed']),
    supabase
      .from('inquiries')
      .select('*, client:clients(name, phone), property:properties(title, address)')
      .eq('agent_id', user.id)
      .eq('organization_id', currentOrgId)
      .order('sent_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="flex flex-col flex-1">
      <TopNav title="לוח בקרה" />

      <div className="p-6 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="סה״כ נכסים" value={totalProperties ?? 0} icon={Building2} color="orange" />
          <StatCard title="לקוחות פעילים" value={activeClients ?? 0} icon={Users} color="blue" />
          <StatCard title="שידוכים השבוע" value={matchesThisWeek ?? 0} icon={Link2} color="purple" />
          <StatCard title="עסקאות שנסגרו" value={closedDeals ?? 0} icon={CheckCircle} color="green" />
        </div>

        {/* Activity feed */}
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)]">
          <div className="px-6 py-4 border-b border-[rgba(218,119,86,0.15)]">
            <h2 className="font-semibold text-[#F5F1EB]">פעילות אחרונה</h2>
          </div>
          <div className="p-6">
            <ActivityFeed inquiries={(recentInquiries as Inquiry[]) ?? []} />
          </div>
        </div>
      </div>
    </div>
  )
}
