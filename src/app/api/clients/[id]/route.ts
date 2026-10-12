import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { patchClientSchema } from '@/lib/validations/client.schema'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = patchClientSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clients')
    .update(result.data)
    .eq('id', id)
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)
    .select()
    .single()

  if (error) {
    console.error('PATCH /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'שגיאה בעדכון לקוח' }, { status: 500 })
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
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)

  if (error) {
    console.error('DELETE /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'שגיאה במחיקת לקוח' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
