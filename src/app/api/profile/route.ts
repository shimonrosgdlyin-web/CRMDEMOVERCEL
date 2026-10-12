import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { profileSchema } from '@/lib/validations/profile.schema'

// Not org-scoped — a profile row belongs to exactly one user (auth.uid() =
// id), so there is no currentOrgId concept here, same as
// /api/auth/current-org.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = profileSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { full_name, phone, agency_name } = result.data

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name,
      phone: phone || null,
      agency_name: agency_name || null,
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: 'עדכון הפרופיל נכשל' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
