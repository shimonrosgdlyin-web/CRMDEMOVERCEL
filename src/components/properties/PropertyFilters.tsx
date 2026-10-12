'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

const TYPES = [
  { value: 'apartment', label: 'דירה' },
  { value: 'house',     label: 'בית פרטי' },
  { value: 'penthouse', label: 'פנטהאוז' },
  { value: 'land',      label: 'קרקע' },
  { value: 'office',    label: 'משרד' },
]

const STATUSES = [
  { value: '',          label: 'הכל' },
  { value: 'available', label: 'זמין' },
  { value: 'pending',   label: 'ממתין' },
  { value: 'rented',    label: 'מושכר' },
  { value: 'sold',      label: 'נמכר' },
]

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] text-sm placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors'

export default function PropertyFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="bg-[#1A1825] rounded-xl border border-[rgba(218,119,86,0.15)] p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* City filter */}
        <input
          type="text"
          placeholder="עיר..."
          defaultValue={searchParams.get('city') ?? ''}
          onChange={(e) => setParam('city', e.target.value)}
          className={inputClass}
          maxLength={100}
        />

        {/* Type filter */}
        <select
          defaultValue={searchParams.get('type') ?? ''}
          onChange={(e) => setParam('type', e.target.value)}
          className={inputClass}
        >
          <option value="">כל הסוגים</option>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          defaultValue={searchParams.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
          className={inputClass}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Price min */}
        <input
          type="number"
          placeholder="מחיר מינימלי ₪"
          defaultValue={searchParams.get('price_min') ?? ''}
          onChange={(e) => setParam('price_min', e.target.value)}
          className={inputClass}
          min={0}
        />

        {/* Price max */}
        <input
          type="number"
          placeholder="מחיר מקסימלי ₪"
          defaultValue={searchParams.get('price_max') ?? ''}
          onChange={(e) => setParam('price_max', e.target.value)}
          className={inputClass}
          min={0}
        />

        {/* Rooms */}
        <input
          type="number"
          placeholder="חדרים (מינימום)"
          defaultValue={searchParams.get('rooms_min') ?? ''}
          onChange={(e) => setParam('rooms_min', e.target.value)}
          className={inputClass}
          min={0}
          step={0.5}
        />
      </div>
    </div>
  )
}
