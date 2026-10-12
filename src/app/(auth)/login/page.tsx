'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeRedirectPath } from '@/lib/utils'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // /auth/callback redirects here with ?error=oauth_failed on any
  // server-side OAuth failure (code exchange, org resolution) — same fixed,
  // generic Hebrew message as this page's own "any other failure" branch
  // below, never a distinct/raw message (see (auth)/CLAUDE.md's
  // "never display raw backend error text" rule). Read via window.location
  // rather than useSearchParams() for the same reason getRedirectTarget()
  // below does — no Suspense boundary on this page, and this only needs to
  // run once, on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'oauth_failed') {
      setError('אירעה שגיאה, נסה שנית')
    }
  }, [])

  // Read via window.location rather than useSearchParams() — this page is
  // a plain client component with no Suspense boundary, and useSearchParams()
  // would require one; a one-off read inside the submit handler (never
  // needed reactively/for initial render) doesn't need the hook at all.
  // middleware.ts sets this when it redirects an unauthenticated visitor
  // here from a protected route (e.g. /accept-invite?token=...) — always
  // re-validated via safeRedirectPath before use, never trusted as-is.
  function getRedirectTarget(): string {
    if (typeof window === 'undefined') return '/'
    return safeRedirectPath(new URLSearchParams(window.location.search).get('redirect'))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) {
      setError('נא למלא את כל השדות')
      return
    }

    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })

    if (authError) {
      setLoading(false)
      setError('אימייל או סיסמה שגויים')
      return
    }

    // signInWithPassword() runs client-side and can't set an httpOnly
    // cookie itself — this resolves which org the session should start in
    // (existing valid current-org cookie > most-recently-created
    // membership) and sets it server-side. See src/lib/org/current-org.ts.
    const orgRes = await fetch('/api/auth/current-org', { method: 'POST' })
    setLoading(false)

    if (!orgRes.ok) {
      const body = await orgRes.json().catch(() => null)

      if (body?.code === 'NO_ORGANIZATION') {
        // Zero organizations — can legitimately happen (signup was
        // interrupted: email confirmation was pending, or org creation
        // failed transiently after the account already existed; see
        // register/page.tsx). Send them to complete setup instead of a
        // dead end — keep the session alive, /setup-organization needs
        // it (fixed 2026-08-04, see the note below and that page's
        // CLAUDE.md). If they were headed somewhere specific (e.g. an
        // invite link — itself a complete path to getting an org), honor
        // that instead of diverting them.
        const redirectTarget = getRedirectTarget()
        router.push(redirectTarget !== '/' ? redirectTarget : '/setup-organization')
        router.refresh()
        return
      }

      // Any other failure — sign out rather than leave a half-usable
      // session. Always show this same generic message, never orgRes's
      // raw body — this previously interpolated body?.error directly
      // (`body?.error || 'לחשבון זה...'`), but since /api/auth/current-org
      // always includes an `error` field on every non-ok response
      // (including a plain "Unauthorized" for a 401), that fallback was
      // effectively dead code: whatever the API said was always shown
      // verbatim, including raw, English, technical strings on this
      // Hebrew RTL page. Log the real reason for debugging, never surface
      // it (matches root CLAUDE.md's "never display raw error messages"
      // rule; fixed 2026-08-04).
      console.error('POST /api/auth/current-org failed:', orgRes.status, body)
      await supabase.auth.signOut()
      setError('אירעה שגיאה, נסה שנית')
      return
    }

    router.push(getRedirectTarget())
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#F5F1EB] mb-2">CRM נדל"ן</h1>
          <p className="text-[#9B9AAF]">התחבר לחשבונך</p>
        </div>

        <div className="bg-[#1A1825] rounded-2xl p-8 border border-[rgba(218,119,86,0.15)]">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                אימייל
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors"
                placeholder="name@example.com"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
                סיסמה
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors"
                placeholder="••••••••"
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
              className="w-full py-3 rounded-xl bg-[#DA7756] hover:bg-[#C45E3E] text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(218,119,86,0.15)]" />
            <span className="text-xs text-[#6B6A7F]">או</span>
            <div className="h-px flex-1 bg-[rgba(218,119,86,0.15)]" />
          </div>

          <GoogleSignInButton label="התחבר עם Google" disabled={loading} onError={setError} />

          <p className="text-center text-[#9B9AAF] text-sm mt-6">
            אין לך חשבון?{' '}
            <button
              type="button"
              onClick={() => router.push(`/register${typeof window !== 'undefined' ? window.location.search : ''}`)}
              className="text-[#DA7756] hover:underline"
            >
              הירשם כאן
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
