import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import PropertyForm from '@/components/properties/PropertyForm'

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .eq('organization_id', currentOrgId)
    .single()

  if (!property) notFound()

  return (
    <div className="flex flex-col flex-1">
      <TopNav title="עריכת נכס" />
      <div className="p-6 max-w-3xl">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-6">
          <PropertyForm defaultValues={property} propertyId={property.id} />
        </div>
      </div>
    </div>
  )
}
