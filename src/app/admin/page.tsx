import { requirePlatformAdminPage } from '@/lib/admin/require-platform-admin'
import StatCard from '@/components/dashboard/StatCard'
import type { PlatformStats } from '@/types'
import { Building2, Users, Home, UserCheck, MessageSquare, Ban, ShieldCheck, ShieldAlert } from 'lucide-react'

export default async function AdminOverviewPage() {
  const { supabase } = await requirePlatformAdminPage()

  // Server Components query Supabase directly — no HTTP hop through our own
  // API route. /api/admin/* exists for the client components (SuspendButton)
  // and programmatic callers, not for pages to call themselves.
  const { data, error } = await supabase.rpc('admin_platform_stats')
  const stats = (Array.isArray(data) ? data[0] : data) as PlatformStats | undefined

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-[rgba(78,168,222,0.15)] px-6 py-4">
        <h1 className="text-xl font-bold text-[#F5F1EB]">סקירה כללית</h1>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400">
            טעינת הנתונים נכשלה: {error.message}
          </div>
        )}

        {stats && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="ארגונים" value={stats.organization_count} icon={Building2} color="blue" />
              <StatCard title="משתמשים" value={stats.user_count} icon={Users} color="blue" />
              <StatCard title="נכסים" value={stats.property_count} icon={Home} color="orange" />
              <StatCard title="לקוחות" value={stats.client_count} icon={UserCheck} color="orange" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="פניות" value={stats.inquiry_count} icon={MessageSquare} color="purple" />
              <StatCard title="ארגונים מושעים" value={stats.suspended_org_count} icon={Ban} color="red" />
              <StatCard title="משתמשים מושעים" value={stats.suspended_user_count} icon={ShieldAlert} color="red" />
              <StatCard title="אדמיני פלטפורמה" value={stats.platform_admin_count} icon={ShieldCheck} color="blue" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
