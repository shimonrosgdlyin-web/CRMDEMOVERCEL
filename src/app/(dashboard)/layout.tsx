import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import Sidebar from '@/components/layout/Sidebar'

// Centralized "you need an organization to be here" gate — every dashboard
// page used to independently call getCurrentOrgId() and render
// NoOrganizationNotice inline on null, which was a dead end (no way
// forward). Doing it once here means it fires before any page renders, and
// actually sends the user somewhere actionable. Each page's own check is
// left in place as a secondary safety net (should be unreachable in
// practice now, not removed — see (dashboard)/CLAUDE.md).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // middleware.ts is the primary auth gate (redirects unauthenticated
  // visitors to /login before this normally renders) — !user here is a
  // safety-guard case, same convention as every page's own
  // `if (!user) return null`. Don't attempt the org check without a real
  // user id.
  if (user) {
    const currentOrgId = await getCurrentOrgId(supabase, user.id)
    if (!currentOrgId) {
      // /setup-organization is deliberately outside this route group (not
      // nested under (dashboard)/), so it can never pass through this same
      // layout and re-trigger this redirect — ruled out by construction,
      // not just careful reasoning. See that page's own CLAUDE.md.
      redirect('/setup-organization')
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0F0E17]">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  )
}
