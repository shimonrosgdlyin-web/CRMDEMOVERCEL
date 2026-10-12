import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { clientSchema } from '@/lib/validations/client.schema'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת לקוחות' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = clientSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...result.data, agent_id: user.id, organization_id: currentOrgId })
    .select()
    .single()

  if (error) {
    console.error('POST /api/clients error:', error)
    return NextResponse.json({ error: 'שגיאה ביצירת לקוח' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
