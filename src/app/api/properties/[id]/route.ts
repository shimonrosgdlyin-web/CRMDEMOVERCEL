import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { propertySchema } from '@/lib/validations/property.schema'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = propertySchema.partial().safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  // Properties are org-shared (Stage 2) — any org member may edit any org
  // property, not just the one who listed it.
  const { data, error } = await supabase
    .from('properties')
    .update(result.data)
    .eq('id', id)
    .eq('organization_id', currentOrgId)
    .select()
    .single()

  if (error) {
    console.error('PATCH /api/properties/[id] error:', error)
    return NextResponse.json({ error: 'שגיאה בעדכון נכס' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const { error } = await supabase
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('organization_id', currentOrgId)

  if (error) {
    console.error('DELETE /api/properties/[id] error:', error)
    return NextResponse.json({ error: 'שגיאה במחיקת נכס' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
