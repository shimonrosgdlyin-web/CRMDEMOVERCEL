import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import SetupOrganizationForm from '@/components/team/SetupOrganizationForm'

// Recovery path for an authenticated user with zero organizations. Can
// happen because the signup sequence (signUp -> profile update -> org
// creation) is 3 separate requests, not atomic — e.g. email confirmation
// was pending when signUp() ran (register/page.tsx then deliberately skips
// org creation), or the org-creation call failed transiently after the
// account already existed. See register/page.tsx and (auth)/CLAUDE.md.
//
// Outside both (auth)/ (which redirects an already-authenticated visitor
// away — wrong here, this page specifically needs one) and (dashboard)/
// (whose layout is what redirects HERE in the first place — being outside
// that group means this page structurally cannot re-trigger its own
// redirect condition, which is what rules out a redirect loop, not just
// careful reasoning about it). Same pattern as src/app/accept-invite/.
export default async function SetupOrganizationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // middleware.ts redirects an unauthenticated visitor to /login (with
  // ?redirect=/setup-organization preserved) before this normally renders
  // — this is a safety guard, same convention as every other page.
  if (!user) return null

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (currentOrgId) {
    // Already has an organization. This is a recovery-only page, not a
    // general "create another organization" feature (a user CAN belong to
    // multiple orgs, but that's a different, not-yet-built entry point) —
    // redirect rather than let them create a redundant org through a page
    // that isn't designed for that choice.
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#F5F1EB] mb-2">CRM נדל&quot;ן</h1>
          <p className="text-[#9B9AAF]">כמעט סיימת — הקם את הארגון שלך</p>
        </div>

        <div className="bg-[#1A1825] rounded-2xl p-8 border border-[rgba(218,119,86,0.15)]">
          <p className="text-[#9B9AAF] text-sm mb-6">
            לפני שתוכל להשתמש במערכת, יש להקים ארגון (המשרד או הסוכנות שלך).
          </p>
          <SetupOrganizationForm />
        </div>
      </div>
    </div>
  )
}
