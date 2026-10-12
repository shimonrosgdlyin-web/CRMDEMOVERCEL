import TopNav from '@/components/layout/TopNav'
import ClientForm from '@/components/clients/ClientForm'

export default function NewClientPage() {
  return (
    <div className="flex flex-col flex-1">
      <TopNav title="לקוח חדש" />
      <div className="p-6 max-w-3xl">
        <div className="bg-[#1A1825] rounded-2xl border border-[rgba(218,119,86,0.15)] p-6">
          <ClientForm />
        </div>
      </div>
    </div>
  )
}
