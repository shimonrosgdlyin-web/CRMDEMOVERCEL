import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { verifyClientOwnership } from '@/lib/org/verify-ownership'
import { matchPropertiesToClient } from '@/lib/matching/algorithm'
import { z } from 'zod'
import type { Property, Client } from '@/types'

const schema = z.object({
  client_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'client_id נדרש' }, { status: 400 })
  }

  const { client_id } = result.data

  // Verify client belongs to agent, in the current org
  const client = await verifyClientOwnership(supabase, client_id, user.id, currentOrgId)
  if (!client) return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })

  // Properties are org-shared (Stage 2) — match against every available
  // property in the org, not just ones this agent personally listed.
  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .eq('organization_id', currentOrgId)
    .eq('status', 'available')

  if (!properties || properties.length === 0) {
    return NextResponse.json({ matches: [] })
  }

  const matchResults = matchPropertiesToClient(properties as Property[], client as Client)

  if (matchResults.length === 0) {
    return NextResponse.json({ matches: [] })
  }

  // Upsert matches (insert or update score)
  const { data: upserted, error } = await supabase
    .from('property_client_matches')
    .upsert(
      matchResults.map((m) => ({
        agent_id: user.id,
        organization_id: currentOrgId,
        property_id: m.property_id,
        client_id: m.client_id,
        score: m.score,
      })),
      { onConflict: 'property_id,client_id', ignoreDuplicates: false }
    )
    .select()

  if (error) {
    console.error('POST /api/matches upsert error:', error)
    return NextResponse.json({ error: 'שגיאה בהרצת שידוך' }, { status: 500 })
  }
  return NextResponse.json({ matches: upserted, count: upserted?.length ?? 0 })
}
