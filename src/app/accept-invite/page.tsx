import { createClient } from '@/lib/supabase/server'
import AcceptInviteButton from '@/components/team/AcceptInviteButton'
import { ORGANIZATION_INVITE_ROLE_LABELS, type OrganizationInviteRole } from '@/types'

// Not under (auth)/ (that group is unauthenticated-only and redirects an
// already-logged-in visitor away — the opposite of what this page needs)
// or (dashboard)/ (always renders Sidebar/TopNav, which doesn't fit an
// onboarding-style, possibly-first-ever-authenticated-page moment). A
// standalone top-level route, only getting the root layout, same as (auth)/
// pages effectively do. See src/app/accept-invite/CLAUDE.md.
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // middleware.ts redirects an unauthenticated visitor to /login with
  // ?redirect=/accept-invite?token=... preserved, then back here after
  // login/register succeeds — this is a safety guard, not the real gate.
  if (!user) return null

  if (!token) {
    return (
      <Centered>
        <p className="text-[#F5F1EB] font-semibold mb-2">קישור הזמנה לא תקין</p>
        <p className="text-[#9B9AAF] text-sm">חסר טוקן הזמנה בקישור.</p>
      </Centered>
    )
  }

  // get_invite_preview is security definer specifically so an authenticated
  // non-member can see what a token invites them to without needing any
  // RLS-granted access to organization_invites itself — see
  // 010_organization_invites.sql's header. Returns zero rows for a token
  // that's missing/expired/already consumed/revoked; deliberately no more
  // specific than that (a uniform "invalid" is the safer default).
  //
  // Cast, not inferred — this project has no generated Database types (no
  // `SupabaseClient<Database>` anywhere), so .rpc() results are untyped by
  // default; same reasoning as the `organizationId as string` cast in
  // api/organizations/route.ts.
  const { data: rpcData } = await supabase
    .rpc('get_invite_preview', { invite_token: token })
    .maybeSingle()

  const preview = rpcData as { organization_name: string; role: string } | null

  if (!preview) {
    return (
      <Centered>
        <p className="text-[#F5F1EB] font-semibold mb-2">ההזמנה אינה תקינה</p>
        <p className="text-[#9B9AAF] text-sm">
          ייתכן שההזמנה פגה תוקף, כבר נוצלה, או שהקישור שגוי. פנה לשולח ההזמנה לקבלת קישור חדש.
        </p>
      </Centered>
    )
  }

  const role = preview.role as OrganizationInviteRole

  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#F5F1EB] mb-2">CRM נדל&quot;ן</h1>
          <p className="text-[#9B9AAF]">הוזמנת להצטרף לארגון</p>
        </div>

        <div className="bg-[#1A1825] rounded-2xl p-8 border border-[rgba(218,119,86,0.15)] space-y-6">
          <div className="text-center">
            <p className="text-[#F5F1EB] text-lg font-semibold mb-1">{preview.organization_name}</p>
            <p className="text-[#9B9AAF] text-sm">כ{ORGANIZATION_INVITE_ROLE_LABELS[role]}</p>
          </div>

          <AcceptInviteButton token={token} />
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  )
}
