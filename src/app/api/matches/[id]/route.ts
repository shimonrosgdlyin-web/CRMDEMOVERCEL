import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { z } from 'zod'

const schema = z.object({
  status: z.enum(['suggested', 'sent', 'interested', 'rejected']),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('property_client_matches')
    .update({ status: result.data.status })
    .eq('id', id)
    .eq('agent_id', user.id)
    .eq('organization_id', currentOrgId)
    .select()
    .single()

  if (error) {
    console.error('PATCH /api/matches/[id] error:', error)
    return NextResponse.json({ error: 'שגיאה בעדכון סטטוס שידוך' }, { status: 500 })
  }
  return NextResponse.json(data)
}
