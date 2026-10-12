'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, Loader2 } from 'lucide-react'

type Mode = 'loading' | 'enroll' | 'challenge' | 'error'

/**
 * TOTP enrollment + challenge for the platform admin panel.
 *
 * Two entry states:
 *   - no verified factor yet  → 'enroll'    (show QR + secret, then verify)
 *   - already has one         → 'challenge' (just ask for the current code)
 *
 * THE ONE THING NOT TO BREAK: after a successful verify, Supabase issues a NEW
 * access token carrying aal2. The server keeps seeing the old aal1 token until
 * the router cache is busted, so without router.refresh() the admin gets
 * bounced straight back here by /admin/layout.tsx's gate — a loop that looks
 * exactly like "MFA silently doesn't work". refresh() before push().
 */
export default function MfaEnrollForm({ alreadyVerified }: { alreadyVerified: boolean }) {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (cancelled) return

      if (listError) {
        setError(listError.message)
        setMode('error')
        return
      }

      // listFactors().totp contains VERIFIED factors only.
      const verified = factors?.totp ?? []
      if (verified.length > 0) {
        setFactorId(verified[0].id)
        setMode('challenge')
        return
      }

      // Clear any half-finished enrollment first. An unverified factor from an
      // abandoned attempt blocks a fresh enroll(), and its QR code cannot be
      // retrieved again — so starting clean is the only way forward.
      const stale = (factors?.all ?? []).filter((f) => f.status !== 'verified')
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (cancelled) return

      if (enrollError || !data) {
        setError(enrollError?.message ?? 'רישום האימות הדו-שלבי נכשל')
        setMode('error')
        return
      }

      setFactorId(data.id)
      setQrCode(data.totp?.qr_code ?? null)
      setSecret(data.totp?.secret ?? null)
      setMode('enroll')
    }

    void init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verify() {
    if (!factorId) return
    setSubmitting(true)
    setError(null)

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? 'יצירת האתגר נכשלה')
      setSubmitting(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })

    if (verifyError) {
      setError('הקוד שגוי או פג תוקף — נסה שוב')
      setSubmitting(false)
      return
    }

    // See the note at the top of this file: refresh BEFORE navigating.
    router.refresh()
    router.push('/admin')
  }

  if (mode === 'loading') {
    return (
      <div className="flex items-center gap-2 text-[#9B9AAF]">
        <Loader2 size={18} className="animate-spin" />
        טוען…
      </div>
    )
  }

  if (mode === 'error') {
    return <p className="text-red-400">{error}</p>
  }

  return (
    <div className="space-y-5">
      {mode === 'enroll' && (
        <>
          <div>
            <p className="text-sm text-[#9B9AAF] mb-3">
              סרוק את הקוד באפליקציית אימות (Google Authenticator, Authy, 1Password וכדומה):
            </p>
            {qrCode && (
              // qr_code is an SVG data URI produced by Supabase, not user input.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCode}
                alt="קוד QR לאימות דו-שלבי"
                className="w-44 h-44 rounded-xl bg-white p-2"
              />
            )}
          </div>

          {secret && (
            <div>
              <p className="text-xs text-[#9B9AAF] mb-1">או הזן את המפתח ידנית:</p>
              <code className="block px-3 py-2 rounded-xl bg-[#141220] border border-[rgba(78,168,222,0.15)] text-xs text-[#F5F1EB] font-mono break-all">
                {secret}
              </code>
            </div>
          )}

          <p className="text-xs text-[#6B6A7F] leading-relaxed">
            מומלץ לרשום את המפתח בשני מכשירים נפרדים — ל-Supabase אין קודי גיבוי, ואובדן המכשיר
            היחיד ינעל את הפאנל עד התערבות ידנית במסד הנתונים.
          </p>
        </>
      )}

      {mode === 'challenge' && alreadyVerified && (
        <p className="text-sm text-[#9B9AAF]">
          הזן את הקוד הנוכחי מאפליקציית האימות שלך כדי להיכנס לפאנל הניהול.
        </p>
      )}

      <div>
        <label className="block text-sm text-[#9B9AAF] mb-1.5">קוד בן 6 ספרות</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) void verify() }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          dir="ltr"
          className="w-40 px-3 py-2 rounded-xl bg-[#141220] border border-[rgba(78,168,222,0.15)] text-lg tracking-[0.3em] text-center text-[#F5F1EB] placeholder:text-[#6B6A7F] focus:outline-none focus:border-[#4EA8DE]/50 font-mono"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={verify}
        disabled={submitting || code.length !== 6}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-[#4EA8DE] text-white hover:bg-[#4EA8DE]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
        {submitting ? 'מאמת…' : 'אמת והמשך'}
      </button>
    </div>
  )
}
