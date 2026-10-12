import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import ClientTable from '@/components/clients/ClientTable'
import KanbanBoard from '@/components/clients/KanbanBoard'
import ViewToggle from '@/components/properties/ViewToggle'
import { Plus } from 'lucide-react'
import type { Client } from '@/types'

interface Props {
  searchParams: { view?: string }
}

export default async function ClientsPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  // Clients stay private to the assigned agent (Stage 2 decision) — this
  // default view is agent_id-scoped; admin-oversight-sees-everyone is a
  // separate, not-yet-built UI, not this list.
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)
    .order('created_at', { ascending: false })

  const view = searchParams.view ?? 'table'

  return (
    <div className="flex flex-col flex-1">
      <TopNav title="לקוחות" />

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#9B9AAF]">{clients?.length ?? 0} לקוחות</p>
          <div className="flex items-center gap-3">
            <ViewToggle current={view} />
            <Link
              href="/clients/new"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#DA7756] hover:bg-[#C45E3E] text-white text-sm font-semibold transition-colors"
            >
              <Plus size={16} />
              לקוח חדש
            </Link>
          </div>
        </div>

        {view === 'card' ? (
          <KanbanBoard initialClients={(clients as Client[]) ?? []} />
        ) : (
          <ClientTable clients={(clients as Client[]) ?? []} />
        )}
      </div>
    </div>
  )
}
