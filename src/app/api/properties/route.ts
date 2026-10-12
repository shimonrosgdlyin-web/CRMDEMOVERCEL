import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { propertySchema, propertyFilterSchema } from '@/lib/validations/property.schema'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const rawFilters = {
    city: searchParams.get('city') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    price_min: searchParams.get('price_min') ?? undefined,
    price_max: searchParams.get('price_max') ?? undefined,
    rooms_min: searchParams.get('rooms_min') ?? undefined,
  }
  const filterResult = propertyFilterSchema.safeParse(rawFilters)
  if (!filterResult.success) {
    return NextResponse.json({ error: 'פרמטרי חיפוש לא תקינים', fields: filterResult.error.flatten() }, { status: 400 })
  }
  const { city, type, status, price_min, price_max, rooms_min } = filterResult.data

  // Properties are shared org-wide (Stage 2) — scoped by organization_id,
  // not agent_id.
  let query = supabase.from('properties').select('*').eq('organization_id', currentOrgId).order('created_at', { ascending: false })

  if (city)                    query = query.ilike('city', `%${city}%`)
  if (type)                    query = query.eq('type', type)
  if (status)                  query = query.eq('status', status)
  if (price_min !== undefined) query = query.gte('price', price_min)
  if (price_max !== undefined) query = query.lte('price', price_max)
  if (rooms_min !== undefined) query = query.gte('rooms', rooms_min)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'שגיאה בטעינת נכסים' }, { status: 500 })
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

  const result = propertySchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  // agent_id is kept as "who listed it" metadata only — properties access
  // is entirely organization_id-gated as of Stage 2 (007_tenant_aware_rls.sql).
  const { data, error } = await supabase
    .from('properties')
    .insert({ ...result.data, agent_id: user.id, organization_id: currentOrgId })
    .select()
    .single()

  if (error) {
    console.error('POST /api/properties error:', error)
    return NextResponse.json({ error: 'שגיאה ביצירת נכס' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
