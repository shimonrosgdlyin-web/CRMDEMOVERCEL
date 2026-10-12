import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'
import { adminListQuerySchema } from '@/lib/validations/admin.schema'

// GET: every account on the platform.
//
// The RPC reads auth.users (only reachable because it is security definer —
// the `authenticated` role has no grant on that schema) and deliberately omits
// profiles.phone: that is the broker's personal number, and view+suspend has
// no use for it.
export async function GET(req: NextRequest) {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const result = adminListQuerySchema.safeParse(params)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await gate.supabase.rpc('admin_list_users', {
    search_term: result.data.search ?? null,
    limit_count: result.data.limit,
    offset_count: result.data.offset,
  })

  if (error) {
    console.error('GET /api/admin/users error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת משתמשים' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
