import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'
import { suspensionSchema } from '@/lib/validations/admin.schema'

const uuidSchema = z.string().uuid()

// POST { suspended: boolean, reason?: string } — suspend or restore an org.
//
// WHY A SUB-RESOURCE AND NOT `PATCH /api/admin/organizations/[id]`:
// a general PATCH on the org would need a column allowlist to stop anything
// else being smuggled in alongside the suspension flags. A dedicated endpoint
// whose only schema is {suspended, reason} cannot express any other change.
//
// WHY ONE ENDPOINT AND NOT /suspend + /restore: one route, one schema, one
// audit path, and reversibility is explicit in the payload rather than implied
// by which URL you picked.
//
// NOTE ON THE ACTOR: nothing about the caller's identity is sent to the
// database. admin_set_organization_suspended reads auth.uid() itself and
// writes the audit row in the same transaction as the state change — the
// actor is not forgeable and the write cannot happen unlogged. Do not "help"
// by passing a user id here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה ארגון לא תקין' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = suspensionSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { error } = await gate.supabase.rpc('admin_set_organization_suspended', {
    target_org_id: id,
    suspend: result.data.suspended,
    reason: result.data.reason ?? null,
  })

  if (error) {
    console.error('POST /api/admin/organizations/[id]/suspension error:', error)
    return NextResponse.json({ error: 'שגיאה בעדכון סטטוס השעיה' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
