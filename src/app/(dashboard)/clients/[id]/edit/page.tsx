import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import ClientForm from '@/components/clients/ClientForm'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)
    .single()

  if (!client) notFound()

  return (
    <div className="flex flex-col flex-1">
      <TopNav title="עריכת לקוח" />
      <div className="p-6 max-w-3xl">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-6">
          <ClientForm defaultValues={client} clientId={client.id} />
        </div>
      </div>
    </div>
  )
}
