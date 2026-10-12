'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  Link2,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/properties', label: 'נכסים', icon: Building2 },
  { href: '/clients', label: 'לקוחות', icon: Users },
  { href: '/matches', label: 'שידוך נכסים', icon: Link2 },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-[rgba(218,119,86,0.15)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#DA7756] flex items-center justify-center">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-[#F5F1EB] text-sm leading-tight">CRM נדל"ן</p>
            <p className="text-[#9B9AAF] text-xs">ניהול לקוחות ונכסים</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-[#DA7756]/15 text-[#DA7756] border border-[#DA7756]/20'
                  : 'text-[#9B9AAF] hover:bg-[#221F30] hover:text-[#F5F1EB]'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-[rgba(218,119,86,0.15)]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm text-[#9B9AAF] hover:bg-red-500/10 hover:text-red-400 transition-all"
        >
          <LogOut size={18} />
          התנתק
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#1A1825] border-l border-[rgba(218,119,86,0.15)] h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile toggle */}
      <button
        className="md:hidden fixed top-4 end-4 z-50 w-10 h-10 bg-[#1A1825] border border-[rgba(218,119,86,0.15)] rounded-xl flex items-center justify-center text-[#F5F1EB]"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute end-0 top-0 h-full w-64 bg-[#1A1825] border-s border-[rgba(218,119,86,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  )
}
