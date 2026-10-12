import { NextResponse } from 'next/server'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'

// GET: platform-wide totals for the admin dashboard.
//
// Note what this route does NOT do: resolve a current org. The platform panel
// is deliberately not org-scoped — an operator may legitimately belong to zero
// organizations — so requirePlatformAdmin() replaces the
// getUser()+getCurrentOrgId() preamble every tenant route opens with.
export async function GET() {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  const { data, error } = await gate.supabase.rpc('admin_platform_stats')
  if (error) {
    console.error('GET /api/admin/stats error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת נתונים' }, { status: 500 })
  }

  // The RPC is `returns table (...)`, so PostgREST hands back an array of one
  // row. Callers want the object.
  return NextResponse.json(Array.isArray(data) ? data[0] ?? null : data)
}
