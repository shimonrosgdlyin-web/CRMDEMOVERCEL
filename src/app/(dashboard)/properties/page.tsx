import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import PropertyFilters from '@/components/properties/PropertyFilters'
import PropertyTable from '@/components/properties/PropertyTable'
import PropertyCard from '@/components/properties/PropertyCard'
import ViewToggle from '@/components/properties/ViewToggle'
import { Plus } from 'lucide-react'
import type { Property } from '@/types'

interface Props {
  searchParams: {
    city?: string
    type?: string
    status?: string
    price_min?: string
    price_max?: string
    rooms_min?: string
    view?: 'table' | 'card'
  }
}

export default async function PropertiesPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return <NoOrganizationNotice />

  // Properties are shared org-wide (Stage 2 decision) — scoped by
  // organization_id, not agent_id; any org member sees every org property.
  let query = supabase
    .from('properties')
    .select('*')
    .eq('organization_id', currentOrgId)
    .order('created_at', { ascending: false })

  if (searchParams.city) query = query.ilike('city', `%${searchParams.city}%`)
  if (searchParams.type) query = query.eq('type', searchParams.type)
  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.price_min) query = query.gte('price', Number(searchParams.price_min))
  if (searchParams.price_max) query = query.lte('price', Number(searchParams.price_max))
  if (searchParams.rooms_min) query = query.gte('rooms', Number(searchParams.rooms_min))

  const { data: properties } = await query
  const view = searchParams.view ?? 'table'

  return (
    <div className="flex flex-col flex-1">
      <TopNav title="נכסים" />

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#9B9AAF]">{properties?.length ?? 0} נכסים</p>
          <div className="flex items-center gap-3">
            <ViewToggle current={view} />
            <Link
              href="/properties/new"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#DA7756] hover:bg-[#C45E3E] text-white text-sm font-semibold transition-colors"
            >
              <Plus size={16} />
              נכס חדש
            </Link>
          </div>
        </div>

        <PropertyFilters />

        {view === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(properties as Property[])?.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        ) : (
          <PropertyTable properties={(properties as Property[]) ?? []} />
        )}
      </div>
    </div>
  )
}
