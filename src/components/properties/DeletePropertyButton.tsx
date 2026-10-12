'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export default function DeletePropertyButton({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/properties/${propertyId}`, { method: 'DELETE' })
    router.push('/properties')
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#9B9AAF]">בטוח למחוק?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-medium transition-colors"
        >
          {loading ? '...' : 'כן'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-1 rounded-lg bg-[#221F30] text-[#9B9AAF] text-xs font-medium"
        >
          לא
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium"
    >
      <Trash2 size={13} />
      מחיקה
    </button>
  )
}
