'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, RotateCcw, X } from 'lucide-react'

interface Props {
  /** 'organization' | 'user' — decides which endpoint is called. */
  targetType: 'organization' | 'user'
  targetId: string
  /** Shown in the confirmation dialog so you can see what you are about to cut off. */
  targetLabel: string
  isSuspended: boolean
}

// Suspending an organization cuts off every one of its members at once. That
// makes it the single highest-consequence action in the product, so this is
// deliberately NOT a one-click button: it opens a dialog, requires a typed
// reason, and names the target back to you before it will submit.
//
// Restoring is one click plus a confirm — it returns things to the default
// state and needs no justification.
export default function SuspendButton({ targetType, targetId, targetLabel, isSuspended }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endpoint =
    targetType === 'organization'
      ? `/api/admin/organizations/${targetId}/suspension`
      : `/api/admin/users/${targetId}/suspension`

  async function submit() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suspended: !isSuspended,
          // Only sent when suspending — the API treats a reason as required
          // in that direction and irrelevant in the other.
          ...(isSuspended ? {} : { reason }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'הפעולה נכשלה')
        return
      }

      setOpen(false)
      setReason('')
      // Busts the Server Component cache so the table re-renders with the new
      // state — required after every mutation in this codebase.
      router.refresh()
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null) }}
        className={
          isSuspended
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors'
        }
      >
        {isSuspended ? <RotateCcw size={13} /> : <Ban size={13} />}
        {isSuspended ? 'שחזור' : 'השעיה'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !loading && setOpen(false)} />

          <div className="relative w-full max-w-md bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-[#F5F1EB]">
                {isSuspended ? 'שחזור גישה' : 'השעיית גישה'}
              </h2>
              <button
                onClick={() => !loading && setOpen(false)}
                className="p-1 rounded-lg text-[#9B9AAF] hover:text-[#F5F1EB] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[#9B9AAF] mb-4">
              {isSuspended ? (
                <>הגישה של <span className="text-[#F5F1EB] font-medium">{targetLabel}</span> תוחזר במלואה.</>
              ) : targetType === 'organization' ? (
                <>
                  <span className="text-[#F5F1EB] font-medium">{targetLabel}</span> יושעה.
                  <span className="block mt-1 text-red-400">כל חברי הארגון יאבדו גישה מיידית לנתונים.</span>
                </>
              ) : (
                <>
                  <span className="text-[#F5F1EB] font-medium">{targetLabel}</span> יושעה ויאבד גישה מיידית.
                </>
              )}
            </p>

            {!isSuspended && (
              <div className="mb-4">
                <label className="block text-sm text-[#9B9AAF] mb-1.5">
                  סיבה <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="למה מושעה? הסיבה נשמרת ביומן הפעולות."
                  className="w-full px-3 py-2 rounded-xl bg-[#141220] border border-[rgba(78,168,222,0.15)] text-sm text-[#F5F1EB] placeholder:text-[#6B6A7F] focus:outline-none focus:border-[#4EA8DE]/50"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={loading || (!isSuspended && reason.trim().length === 0)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-[#4EA8DE] text-white hover:bg-[#4EA8DE]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'מבצע…' : isSuspended ? 'שחזר גישה' : 'השעה'}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-sm text-[#9B9AAF] hover:bg-[#221F30] hover:text-[#F5F1EB] transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
