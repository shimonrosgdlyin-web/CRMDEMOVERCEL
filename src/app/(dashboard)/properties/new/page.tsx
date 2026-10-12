import TopNav from '@/components/layout/TopNav'
import PropertyForm from '@/components/properties/PropertyForm'

export default function NewPropertyPage() {
  return (
    <div className="flex flex-col flex-1">
      <TopNav title="נכס חדש" />
      <div className="p-6 max-w-3xl">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-6">
          <PropertyForm />
        </div>
      </div>
    </div>
  )
}
