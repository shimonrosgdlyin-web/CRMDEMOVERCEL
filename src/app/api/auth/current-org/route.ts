import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentOrg, setCurrentOrgCookie } from '@/lib/org/current-org'

// Called by the login flow right after supabase.auth.signInWithPassword()
// succeeds, since that call happens client-side and can't set an httpOnly
// cookie itself. Resolves which org this session should default to
// (existing valid cookie > most-recently-created membership) and persists
// it. Also the one place that surfaces "this account has no organization"
// as a clear error rather than letting the dashboard silently render empty
// — shouldn't happen for any account created after this migration, but can
// for pre-existing dev/test accounts that predate Stage 3.
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { organizationId, hasNoOrganizations } = await resolveCurrentOrg(supabase, user.id)

  if (hasNoOrganizations || !organizationId) {
    return NextResponse.json(
      { error: 'לחשבון זה אין ארגון משויך. פנה לתמיכה.', code: 'NO_ORGANIZATION' },
      { status: 404 }
    )
  }

  await setCurrentOrgCookie(organizationId)

  return NextResponse.json({ organization_id: organizationId })
}
