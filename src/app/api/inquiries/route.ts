import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { verifyClientOwnership, verifyPropertyOwnership } from '@/lib/org/verify-ownership'
import { inquirySchema } from '@/lib/validations/inquiry.schema'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const { data, error } = await supabase
    .from('inquiries')
    .select('*, client:clients(name, phone), property:properties(title, address)')
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)
    .order('sent_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('GET /api/inquiries error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת פניות' }, { status: 500 })
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

  const result = inquirySchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  // Zod only checks client_id/property_id are valid UUIDs — confirm they
  // actually belong to this agent's org before logging an inquiry against
  // them (security-review finding, 2026-08-30).
  const client = await verifyClientOwnership(supabase, result.data.client_id, user.id, currentOrgId)
  if (!client) return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  if (result.data.property_id) {
    const property = await verifyPropertyOwnership(supabase, result.data.property_id, currentOrgId)
    if (!property) return NextResponse.json({ error: 'נכס לא נמצא' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('inquiries')
    .insert({ ...result.data, agent_id: user.id, organization_id: currentOrgId })
    .select()
    .single()

  if (error) {
    console.error('POST /api/inquiries error:', error)
    return NextResponse.json({ error: 'שגיאה בשמירת פנייה' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
