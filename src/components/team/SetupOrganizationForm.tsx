'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Single-field form, submits to the EXISTING POST /api/organizations route
// (same organizationSchema, same create_organization_with_owner RPC used by
// signup — not a new/duplicate creation path). Deliberately never sends
// anything but { name } — no organization_id or any other identifier is
// ever taken from the client here; the server derives everything else
// (caller identity via getUser(), the new org's id from the RPC's return
// value).
export default function SetupOrganizationForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('נא למלא שם ארגון / סוכנות')
      return
    }

    setLoading(true)
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setLoading(false)

    if (res.ok) {
      router.push('/')
      router.refresh()
      return
    }

    // Never interpolate the raw API response into the UI — the 500 path in
    // /api/organizations/route.ts can surface a raw Postgres error message,
    // which isn't safe/intended for direct display (same class of bug
    // found and fixed in login/page.tsx on 2026-08-04, see (auth)/CLAUDE.md).
    // Log the real reason for debugging, always show a fixed message.
    const body = await res.json().catch(() => null)
    console.error('POST /api/organizations failed:', res.status, body)
    setError('שגיאה בהקמת הארגון, נסה שנית')
  }

  const fieldClass =
    'w-full px-4 py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className="block text-sm font-medium text-[#9B9AAF] mb-2">
          שם משרד / סוכנות <span className="text-[#DA7756]">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
          placeholder="שם הסוכנות / המשרד"
          maxLength={200}
          autoFocus
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
        {loading ? 'מקים ארגון...' : 'הקם ארגון'}
      </button>
    </form>
  )
}
