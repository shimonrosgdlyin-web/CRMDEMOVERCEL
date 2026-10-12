import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin, platformAdminErrorResponse } from '@/lib/admin/require-platform-admin'
import { suspensionSchema } from '@/lib/validations/admin.schema'

const uuidSchema = z.string().uuid()

// POST { suspended: boolean, reason?: string } — suspend or restore a user.
//
// Two refusals happen inside admin_set_user_suspended (migration 013), not
// here, so they hold even against a direct PostgREST call:
//   1. an admin cannot suspend their own account
//   2. no platform admin can be suspended through this API at all
// Together those make operator lockout structurally impossible via the
// product — the mutual-suspension deadlock has nowhere to start.
//
// Both surface as a Postgres exception, which becomes a 500 below. That is
// blunt but honest: they are "this must never happen" guards, not routine
// validation the UI is expected to walk a user through.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const gate = await requirePlatformAdmin()
  if (!gate.ok) return platformAdminErrorResponse(gate)

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה משתמש לא תקין' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = suspensionSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { error } = await gate.supabase.rpc('admin_set_user_suspended', {
    target_user_id: id,
    suspend: result.data.suspended,
    reason: result.data.reason ?? null,
  })

  if (error) {
    console.error('POST /api/admin/users/[id]/suspension error:', error)
    return NextResponse.json({ error: 'שגיאה בעדכון סטטוס השעיה' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
