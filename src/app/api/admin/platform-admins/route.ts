import { NextResponse } from 'next/server'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'

// GET: the platform-admin roster.
//
// Read-only, and there is no matching POST/DELETE anywhere in this app by
// design — platform_admins has no INSERT/UPDATE/DELETE policy at all
// (migration 013), so granting or revoking operator access is always a
// deliberate SQL operation outside the product. If you came here looking for
// "add an admin", that is the answer: it is not an API.
export async function GET() {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  const { data, error } = await gate.supabase.rpc('admin_list_platform_admins')
  if (error) {
    console.error('GET /api/admin/platform-admins error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת רשימת מנהלים' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
