import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { verifyClientOwnership, verifyPropertyOwnership } from '@/lib/org/verify-ownership'
import { z } from 'zod'

const schema = z.object({
  to: z.string().email(),
  // .trim() only strips leading/trailing whitespace, not embedded CR/LF —
  // subject becomes a raw SMTP header, so an embedded \r or \n here is a
  // header-injection vector (the installed nodemailer version is disclosed
  // vulnerable to exactly this input shape). Rejected outright rather than
  // stripped, so the sender sees why instead of a silently mangled subject.
  subject: z.string().min(1).max(300).trim().refine(
    (s) => !/[\r\n]/.test(s),
    'הנושא לא יכול להכיל שורות חדשות'
  ),
  body: z.string().min(1).max(5000).trim(),
  client_id: z.string().uuid(),
  property_id: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { to, subject, body: emailBody, client_id, property_id } = result.data

  // Zod only checks client_id/property_id are valid UUIDs — confirm they
  // actually belong to this agent's org before referencing them
  // (security-review finding, 2026-08-30).
  const client = await verifyClientOwnership(supabase, client_id, user.id, currentOrgId)
  if (!client) return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  if (property_id) {
    const property = await verifyPropertyOwnership(supabase, property_id, currentOrgId)
    if (!property) return NextResponse.json({ error: 'נכס לא נמצא' }, { status: 404 })
  }

  // Check SMTP config
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return NextResponse.json({ error: 'SMTP לא מוגדר — השתמש ב-mailto: במקום' }, { status: 503 })
  }

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text: emailBody,
    })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: 'שגיאה בשליחת מייל' }, { status: 500 })
  }

  // Log inquiry
  await supabase.from('inquiries').insert({
    agent_id: user.id,
    organization_id: currentOrgId,
    client_id,
    property_id: property_id ?? null,
    type: 'email',
    message: `נשלח מייל ל-${to}`,
  })

  return NextResponse.json({ ok: true })
}
