import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { organizationSchema } from '@/lib/validations/organization.schema'
import { setCurrentOrgCookie } from '@/lib/org/current-org'

// Creates a new organization with the calling user as 'owner' (atomic —
// see 009_create_organization_rpc.sql, fixed in
// 011_fix_create_organization_returning_rls.sql, hardened against a
// missing-profiles-row edge case in 012_org_rpc_profile_backfill.sql), then
// sets the current-org cookie to it. Used by the signup flow (Piece 1 of
// Stage 3) right after supabase.auth.signUp() succeeds, and by
// /setup-organization's recovery form. Not (yet) a general "create another
// org" UI action — that's implied but not built by this route existing; the
// invite flow / multi-org creation UI are separate, later work.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = organizationSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { data: organizationId, error } = await supabase.rpc('create_organization_with_owner', {
    org_name: result.data.name,
  })

  if (error || !organizationId) {
    console.error('POST /api/organizations error:', error)
    return NextResponse.json({ error: 'שגיאה ביצירת הארגון' }, { status: 500 })
  }

  await setCurrentOrgCookie(organizationId as string)

  return NextResponse.json({ organization_id: organizationId }, { status: 201 })
}
