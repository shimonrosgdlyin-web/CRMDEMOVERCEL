import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'
import { adminListQuerySchema } from '@/lib/validations/admin.schema'

// GET: the admin audit log.
//
// The one admin read that is NOT an RPC. admin_audit_log already carries an
// `is_platform_admin()`-gated SELECT policy, so querying it directly is both
// safe and gets PostgREST's filtering/pagination for free — wrapping it in a
// function would only re-implement that by hand.
//
// `search` is ignored here (there is no sensible single text column to match
// on); the schema is reused for its limit/offset coercion and bounds.
export async function GET(req: NextRequest) {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const result = adminListQuerySchema.safeParse(params)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { limit, offset } = result.data

  const { data, error } = await gate.supabase
    .from('admin_audit_log')
    .select('id, actor_id, actor_email, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('GET /api/admin/audit-log error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת יומן פעולות' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
