import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import NoOrganizationNotice from '@/components/layout/NoOrganizationNotice'
import TopNav from '@/components/layout/TopNav'
import PropertyStatusBadge from '@/components/properties/PropertyStatusBadge'
import { formatPrice, formatDate } from '@/lib/utils'
import { PROPERTY_TYPE_LABELS, type PropertyType, type PropertyStatus } from '@/types'
import { MapPin, BedDouble, Maximize2, Car, Layers, Pencil } from 'lucide-react'
import DeletePropertyButton from '@/components/properties/DeletePropertyButton'

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      <TopNav title={property.title} />

      <div className="p-6 space-y-6 max-w-4xl">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <PropertyStatusBadge status={property.status as PropertyStatus} />
                <span className="text-sm text-[#9B9AAF]">{PROPERTY_TYPE_LABELS[property.type as PropertyType]}</span>
              </div>
              <h1 className="text-2xl font-bold text-[#F5F1EB]">{property.title}</h1>
              <div className="flex items-center gap-1 text-[#9B9AAF] text-sm mt-1">
                <MapPin size={14} />
                {property.address}, {property.city}
              </div>
            </div>
            <p className="text-3xl font-bold text-[#DA7756]">{formatPrice(property.price)}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {property.rooms && (
              <div className="bg-[#141220] rounded-xl p-4 text-center">
                <BedDouble size={20} className="text-[#DA7756] mx-auto mb-1" />
                <p className="text-lg font-bold text-[#F5F1EB]">{property.rooms}</p>
                <p className="text-xs text-[#9B9AAF]">חדרים</p>
              </div>
            )}
            {property.size_sqm && (
              <div className="bg-[#141220] rounded-xl p-4 text-center">
                <Maximize2 size={20} className="text-[#DA7756] mx-auto mb-1" />
                <p className="text-lg font-bold text-[#F5F1EB]">{property.size_sqm}</p>
                <p className="text-xs text-[#9B9AAF]">מ"ר</p>
              </div>
            )}
            {property.floor !== null && (
              <div className="bg-[#141220] rounded-xl p-4 text-center">
                <Layers size={20} className="text-[#DA7756] mx-auto mb-1" />
                <p className="text-lg font-bold text-[#F5F1EB]">{property.floor}</p>
                <p className="text-xs text-[#9B9AAF]">קומה</p>
              </div>
            )}
            <div className="bg-[#141220] rounded-xl p-4 text-center">
              <Car size={20} className="text-[#DA7756] mx-auto mb-1" />
              <p className="text-sm font-bold text-[#F5F1EB]">
                {property.parking ? '✓ יש' : '✗ אין'}
              </p>
              <p className="text-xs text-[#9B9AAF]">חניה</p>
            </div>
          </div>

          {property.description && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#9B9AAF] mb-2">תיאור</h3>
              <p className="text-[#F5F1EB] text-sm leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-[#6B6A7F] pt-4 border-t border-[rgba(218,119,86,0.1)]">
            <span>נוצר: {formatDate(property.created_at)}</span>
            <div className="flex items-center gap-2">
              <Link
                href={`/properties/${property.id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DA7756]/10 text-[#DA7756] hover:bg-[#DA7756]/20 transition-colors text-xs font-medium"
              >
                <Pencil size={13} />
                עריכה
              </Link>
              <DeletePropertyButton propertyId={property.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
