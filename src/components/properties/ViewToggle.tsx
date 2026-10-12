'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ViewToggle({ current }: { current: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setView(view: 'table' | 'card') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1 bg-[#1A1825] border border-[rgba(218,119,86,0.15)] rounded-lg p-1">
      <button
        onClick={() => setView('table')}
        className={cn(
          'p-1.5 rounded-md transition-colors',
          current === 'table' ? 'bg-[#DA7756]/20 text-[#DA7756]' : 'text-[#9B9AAF] hover:text-[#F5F1EB]'
        )}
        title="תצוגת טבלה"
      >
        <List size={16} />
      </button>
      <button
        onClick={() => setView('card')}
        className={cn(
          'p-1.5 rounded-md transition-colors',
          current === 'card' ? 'bg-[#DA7756]/20 text-[#DA7756]' : 'text-[#9B9AAF] hover:text-[#F5F1EB]'
        )}
        title="תצוגת כרטיסים"
      >
        <LayoutGrid size={16} />
      </button>
    </div>
  )
}
