'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'

export default function RunMatchButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRun() {
    setLoading(true)
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleRun}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#DA7756]/15 text-[#DA7756] hover:bg-[#DA7756]/25 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Zap size={14} />
      {loading ? 'מחפש...' : 'הרץ שידוך'}
    </button>
  )
}
