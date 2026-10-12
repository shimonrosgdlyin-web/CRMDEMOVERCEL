import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'

const uuidSchema = z.string().uuid()

// GET: one organization + its member roster (emails, roles, join dates).
//
// Still metadata only — this does not expose the org's properties, clients,
// matches or inquiries.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Next.js 16 — params is a Promise. Await and destructure on the first line,
  // never touch `params.id` directly (src/app/api/CLAUDE.md).
  const { id } = await params

  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  // Validate before the RPC: an id that isn't a UUID makes Postgres raise a
  // cast error, which would surface as a confusing 500 instead of a 400.
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה ארגון לא תקין' }, { status: 400 })
  }

  const { data, error } = await gate.supabase.rpc('admin_get_organization', {
    target_org_id: id,
  })

  if (error) {
    console.error('GET /api/admin/organizations/[id] error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת ארגון' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'ארגון לא נמצא' }, { status: 404 })
  }

  return NextResponse.json(data)
}
