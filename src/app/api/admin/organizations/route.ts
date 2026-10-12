import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'
import { adminListQuerySchema } from '@/lib/validations/admin.schema'

// GET: every organization on the platform, with usage counts.
//
// Returns org METADATA and row counts only — never a tenant's actual
// properties/clients/inquiries. That boundary lives in the RPC
// (admin_list_organizations, migration 013), not here; this route could not
// widen it even if it tried, because the underlying tables' RLS still applies
// to anything it queried directly.
export async function GET(req: NextRequest) {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const result = adminListQuerySchema.safeParse(params)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await gate.supabase.rpc('admin_list_organizations', {
    search_term: result.data.search ?? null,
    limit_count: result.data.limit,
    offset_count: result.data.offset,
  })

  if (error) {
    console.error('GET /api/admin/organizations error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת ארגונים' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
