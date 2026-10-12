import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setCurrentOrgCookie } from '@/lib/org/current-org'
import { acceptInviteSchema } from '@/lib/validations/invite.schema'

// Accepting an invite is the only path (besides self-bootstrapping a
// brand-new org) to a new organization_members row as of
// 010_organization_invites.sql — see that migration's header for why.
// Deliberately thin: all real validation (token exists/pending/not expired,
// caller's own account email matches the invite, organization_id/role come
// only from the looked-up invite row, never from this request) happens
// inside accept_organization_invite() itself, which is security definer
// specifically because no RLS-governed insert can perform this operation
// post-010. This route's job is just auth + input shape + translating the
// RPC's outcome into an HTTP response + setting the cookie on success.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = acceptInviteSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'טוקן הזמנה לא תקין' }, { status: 400 })
  }

  const { data: organizationId, error } = await supabase.rpc('accept_organization_invite', {
    invite_token: result.data.token,
  })

  if (error || !organizationId) {
    // The RPC's own exception messages (invite not found / no longer
    // pending / expired / not addressed to this account) are safe to
    // surface directly — none of them leak anything about other invites,
    // other users, or other orgs beyond what the token holder already
    // implicitly knows.
    return NextResponse.json({ error: error?.message ?? 'ההזמנה אינה תקינה' }, { status: 400 })
  }

  await setCurrentOrgCookie(organizationId as string)

  return NextResponse.json({ organization_id: organizationId })
}
