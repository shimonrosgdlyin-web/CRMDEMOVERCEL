'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

/**
 * Search box for the admin list pages. Writes the term to `?search=` and lets
 * the Server Component re-fetch — no client-side data fetching, so the RPC's
 * platform-admin check is still the only thing standing between this box and
 * the data.
 *
 * The value is passed to Supabase as a bound RPC parameter and used in an
 * ILIKE comparison inside the function; it is never interpolated into SQL.
 */
export default function AdminSearchBox({
  placeholder,
  defaultValue,
}: {
  placeholder: string
  defaultValue: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(defaultValue)

  function submit() {
    const trimmed = value.trim()
    router.push(trimmed ? `${pathname}?search=${encodeURIComponent(trimmed)}` : pathname)
  }

  return (
    <div className="relative max-w-sm">
      <Search
        size={15}
        className="absolute start-3 top-1/2 -translate-y-1/2 text-[#6B6A7F] pointer-events-none"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        onBlur={submit}
        maxLength={100}
        placeholder={placeholder}
        className="w-full ps-9 pe-3 py-2 rounded-xl bg-[#1A1825] border border-[rgba(78,168,222,0.15)] text-sm text-[#F5F1EB] placeholder:text-[#6B6A7F] focus:outline-none focus:border-[#4EA8DE]/50"
      />
    </div>
  )
}
