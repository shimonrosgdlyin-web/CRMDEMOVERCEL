'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeRedirectPath } from '@/lib/utils'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  // See login/page.tsx's getRedirectTarget for why window.location is read
  // directly here rather than via useSearchParams(). Note the residual
  // product wrinkle this doesn't solve: a brand-new user (no account yet)
  // who registers via an invite link still goes through the normal signup
  // flow, which creates its OWN new organization (register always does
  // this) — they land back on /accept-invite as a member of that new org
  // AND then join the invited org too, ending up in both. Not broken (a
  // user can belong to multiple orgs), just not the smoothest first
  // impression; a signup variant that skips org-creation when arriving via
  // an invite is a reasonable follow-up, not built here.
  function getRedirectTarget(): string {
    if (typeof window === 'undefined') return '/'
    return safeRedirectPath(new URLSearchParams(window.location.search).get('redirect'))
  }

  const [form, setForm] = useState({
    fullName: '',
    agencyName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.fullName.trim() || !form.email.trim() || !form.password) {
      setError('נא למלא את כל השדות החובה')
      return
    }
    // agencyName is now required — it becomes the new organization's name
    // (organizations.name is NOT NULL). profiles.agency_name still gets the
    // same value too (kept as a legacy mirror, not dropped — see
    // 009_create_organization_rpc.sql / crm-playful-wilkinson Stage 3 notes).
    if (!form.agencyName.trim()) {
      setError('נא למלא שם ארגון / סוכנות')
      return
    }
    if (form.password.length < 8) {
      setError('הסיסמה חייבת לכלול לפחות 8 תווים')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('הסיסמאות אינן תואמות')
      return
    }

    setLoading(true)

    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    })

    if (authError || !data.user) {
      setLoading(false)
      // Never interpolate the raw Supabase Auth error — it's raw English
      // SDK text (e.g. "User already registered"), not safe for direct
      // display on this Hebrew RTL page (same class of bug fixed in
      // login/page.tsx, commit 5139f44, and in this file's own
      // org-creation-failure branch below; see (auth)/CLAUDE.md). Log the
      // real reason, always show a fixed message.
      console.error('supabase.auth.signUp failed:', authError)
      setError('שגיאה בהרשמה, נסה שנית')
      return
    }

    if (!data.session) {
      // signUp() can return a user with no session — this happens
      // whenever email confirmation is pending on this Supabase project
      // (a normal, real state, not an edge case). Neither the profile
      // update nor POST /api/organizations below can do anything
      // meaningful without an authenticated session: the profile update
      // would silently no-op (RLS-blocked, no surfaced error, since it's
      // an .update() with no .select() to notice zero rows changed), and
      // /api/organizations would 401 pointlessly, producing a confusing
      // "account created but org setup failed" message that
      // misrepresents what's actually happening. Stop here instead, with
      // an accurate message.
      //
      // After the user confirms their email and logs in for the first
      // time, login/page.tsx resolves organizations via
      // POST /api/auth/current-org — since org creation was skipped here,
      // that will report zero organizations. Fixed 2026-08-04: login now
      // redirects to /setup-organization for that case instead of
      // dead-ending, so this path recovers cleanly rather than requiring
      // manual intervention — see src/app/setup-organization/CLAUDE.md.
      setLoading(false)
      setError('בדוק את תיבת הדואר שלך לאישור החשבון, ואז התחבר')
      return
    }

    // handle_new_user() (001_initial_schema.sql) already inserted this row
    // as part of signUp() — update it, don't insert (insert would collide
    // on the existing primary key and silently fail, dropping these fields).
    // Goes through PATCH /api/profile (not a direct browser-to-PostgREST
    // write) so profileSchema actually runs server-side — the direct write
    // this replaced had no server-side validation at all, only client-side
    // .slice() truncation (security-review finding, 2026-08-30). Best-effort,
    // same as the rest of this flow: a failure here shouldn't block signup
    // over cosmetic profile fields the user can fix later.
    const profileRes = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        agency_name: form.agencyName.trim() || undefined,
      }),
    })
    if (!profileRes.ok) {
      console.error('PATCH /api/profile failed:', profileRes.status, await profileRes.json().catch(() => null))
    }

    // Creates the organizations + organization_members(role: 'owner') rows
    // atomically server-side and sets the httpOnly current-org cookie —
    // must go through the API route (not the browser client directly)
    // specifically so the cookie can be set as an httpOnly Set-Cookie
    // response header, which client-side JS cannot do.
    const orgRes = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.agencyName.trim() }),
    })

    if (!orgRes.ok) {
      setLoading(false)
      // The auth account + profile were already created successfully at
      // this point — org creation is a separate step that can fail on its
      // own (e.g. a transient DB error). There is no client-side way to
      // roll back the auth signup (that needs the service-role admin API,
      // which must never run in client-exposed code). Surfacing a clear
      // message is the honest option here rather than pretending this is
      // fully atomic end-to-end; the RPC itself (org + membership) is
      // atomic, this outer signup sequence across separate requests is not
      // — same limitation the pre-existing signUp-then-insert-profile flow
      // already had, not something newly introduced here. Logging back in
      // now actually recovers (fixed 2026-08-04 — login redirects to
      // /setup-organization on zero organizations instead of dead-ending),
      // so the message says that rather than a vague "contact support."
      //
      // Never interpolate the raw API error — the 500 path in
      // /api/organizations/route.ts can return a raw Postgres error
      // message, not safe for direct display (same class of bug fixed in
      // login/page.tsx on 2026-08-04; see (auth)/CLAUDE.md). Log the real
      // reason, always show a fixed message.
      const body = await orgRes.json().catch(() => null)
      console.error('POST /api/organizations failed:', orgRes.status, body)
      setError('החשבון נוצר אך הקמת הארגון נכשלה. נסה להתחבר — תוכל להשלים את ההקמה משם.')
      return
    }

    setLoading(false)
    router.push(getRedirectTarget())
    router.refresh()
  }

  const fieldClass =
    'w-full px-4 py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors'

  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#F5F1EB] mb-2">CRM נדל"ן</h1>
          <p className="text-[#9B9AAF]">צור חשבון חדש</p>
        </div>

        <div className="bg-[#1A1825] rounded-2xl p-8 border border-[rgba(218,119,86,0.15)]">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                שם מלא <span className="text-[#DA7756]">*</span>
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setField('fullName', e.target.value)}
                className={fieldClass}
                placeholder="ישראל ישראלי"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                שם משרד / סוכנות <span className="text-[#DA7756]">*</span>
              </label>
              <input
                type="text"
                value={form.agencyName}
                onChange={(e) => setField('agencyName', e.target.value)}
                className={fieldClass}
                placeholder="שם הסוכנות / המשרד"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                טלפון
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className={fieldClass}
                placeholder="050-0000000"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                אימייל <span className="text-[#DA7756]">*</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                className={fieldClass}
                placeholder="name@example.com"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                סיסמה <span className="text-[#DA7756]">*</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                className={fieldClass}
                placeholder="לפחות 8 תווים"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                אימות סיסמה <span className="text-[#DA7756]">*</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)}
                className={fieldClass}
                placeholder="חזור על הסיסמה"
                maxLength={100}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#DA7756] hover:bg-[#C45E3E] text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'נרשם...' : 'הירשם'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(218,119,86,0.15)]" />
            <span className="text-xs text-[#6B6A7F]">או</span>
            <div className="h-px flex-1 bg-[rgba(218,119,86,0.15)]" />
          </div>

          {/* OAuth sign-in creates the account automatically via
              handle_new_user() (fires on any auth.users insert, not
              provider-specific — see supabase/CLAUDE.md) — same button,
              same /auth/callback landing point as login/page.tsx, no
              separate "register with Google" flow needed. */}
          <GoogleSignInButton label="הירשם עם Google" disabled={loading} onError={setError} />

          <p className="text-center text-[#9B9AAF] text-sm mt-6">
            כבר יש לך חשבון?{' '}
            <button
              type="button"
              onClick={() => router.push(`/login${typeof window !== 'undefined' ? window.location.search : ''}`)}
              className="text-[#DA7756] hover:underline"
            >
              התחבר כאן
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
