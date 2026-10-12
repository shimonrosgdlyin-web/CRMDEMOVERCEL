import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current-org'
import { inviteSchema } from '@/lib/validations/invite.schema'

// GET: list this org's invites — RLS (is_org_admin) already restricts this
// to admins/owners, but selects an explicit column list rather than '*' so
// `token` is never returned in a general listing (it's a bearer credential
// for accepting an invite — only the create response below should ever
// include it, directly to the admin who just generated it).
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const { data, error } = await supabase
    .from('organization_invites')
    .select('id, organization_id, email, role, invited_by, status, created_at, updated_at, accepted_at, expires_at')
    .eq('organization_id', currentOrgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET /api/organizations/invites error:', error)
    return NextResponse.json({ error: 'שגיאה בטעינת הזמנות' }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST: create an invite. RLS (organization_invites' insert policy) is the
// actual enforcement of "owner/admin only" — is_org_admin(organization_id)
// — this route doesn't duplicate that check itself, matching the existing
// convention documented in src/app/api/CLAUDE.md ("403 — rare, RLS usually
// turns this into a 404/empty result first"); a non-admin's insert attempt
// simply fails at the DB layer and surfaces as a generic error below.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentOrgId = await getCurrentOrgId(supabase, user.id)
  if (!currentOrgId) return NextResponse.json({ error: 'לא נמצא ארגון פעיל' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const result = inviteSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'ולידציה נכשלה', fields: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: currentOrgId,
      email: result.data.email,
      role: result.data.role,
      invited_by: user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation — organization_invites_one_pending_per_org_email
    if (error.code === '23505') {
      return NextResponse.json({ error: 'כבר קיימת הזמנה ממתינה לכתובת מייל זו' }, { status: 409 })
    }
    console.error('POST /api/organizations/invites error:', error)
    return NextResponse.json({ error: 'שגיאה ביצירת הזמנה' }, { status: 500 })
  }

  // Best-effort email delivery — the invite row (and its link) is the real
  // deliverable; if SMTP isn't configured or sending fails, the invite still
  // exists and can be shared manually (this codebase already leans on
  // manual WhatsApp/mailto sharing elsewhere, e.g. src/lib/whatsapp.ts), so
  // this never fails the whole request the way /api/email's primary-purpose
  // send does.
  //
  // acceptUrl is built ONLY from the pinned APP_URL env var
  // (.env.local.example) — never from req.nextUrl.origin, which reflects
  // the request's Host header that this authenticated, admin-only caller
  // controls; building an outgoing-email link from it would let a
  // malicious/compromised admin account poison the link (ct-9c4a2f17). A
  // prior version fell back to req.nextUrl.origin with just a console
  // warning when APP_URL was unset — that fallback WAS the vulnerable
  // behavior, so it's removed outright rather than softened: with no
  // trustworthy base URL, the invite row is still created (so it's not
  // lost), but no link is built and no email is sent, and the response says
  // exactly why so an admin isn't left silently confused.
  const baseUrl = process.env.APP_URL?.replace(/\/+$/, '')
  let acceptUrl: string | undefined
  let emailWarning: string | undefined

  if (!baseUrl) {
    console.error('APP_URL is not set — refusing to build an invite link from the request Host header. Set APP_URL in .env.local (see .env.local.example).')
    emailWarning = 'ההזמנה נוצרה אך לא ניתן היה ליצור קישור — יש להגדיר APP_URL בהגדרות השרת'
  } else {
    acceptUrl = `${baseUrl}/accept-invite?token=${data.token}`

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
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
          to: result.data.email,
          subject: 'הוזמנת להצטרף לארגון ב-CRM נדל"ן',
          text: `הוזמנת להצטרף לארגון כ${result.data.role === 'admin' ? 'מנהל' : 'סוכן'}.\n\nלחץ כדי להצטרף:\n${acceptUrl}\n\nההזמנה בתוקף ל-7 ימים.`,
        })
      } catch (err) {
        console.error('Invite email send error:', err)
        emailWarning = 'ההזמנה נוצרה אך שליחת המייל נכשלה — ניתן לשתף את קישור ההזמנה ידנית'
      }
    } else {
      emailWarning = 'SMTP לא מוגדר — ניתן לשתף את קישור ההזמנה ידנית'
    }
  }

  const { token, ...inviteWithoutToken } = data
  return NextResponse.json(
    { ...inviteWithoutToken, ...(acceptUrl ? { invite_url: acceptUrl } : {}), ...(emailWarning ? { email_warning: emailWarning } : {}) },
    { status: 201 }
  )
}
