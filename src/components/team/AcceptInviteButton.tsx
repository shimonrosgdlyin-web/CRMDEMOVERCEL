'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    setLoading(true)
    setError('')

    const res = await fetch('/api/organizations/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    if (res.ok) {
      router.push('/')
      router.refresh()
      return
    }

    setLoading(false)
    const body = await res.json().catch(() => null)
    setError(body?.error || 'שגיאה בקבלת ההזמנה, נסה שנית')
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleAccept}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-[#DA7756] hover:bg-[#C45E3E] text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'מצטרף...' : 'הצטרף לארגון'}
      </button>
    </div>
  )
}
