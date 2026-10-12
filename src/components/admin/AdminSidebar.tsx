'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Building2, Users, ScrollText, ArrowRight, ShieldCheck } from 'lucide-react'

// Deliberately a SEPARATE component from layout/Sidebar.tsx rather than a
// prop-driven variant of it.
//
// The tenant sidebar's accent is #DA7756 (orange); this one is #4EA8DE (blue),
// and that difference is the point — an operator acting across every customer's
// data should never be able to mistake which context they are in. Sharing one
// component with a `variant` prop would make that distinction one careless
// default away from disappearing.
//
// It also has no logout button: the tenant sidebar's signs you out of the
// product entirely, which is not what you want mid-investigation. "Back to the
// app" is the useful action here.
const navItems = [
  { href: '/admin', label: 'סקירה כללית', icon: LayoutDashboard },
  { href: '/admin/organizations', label: 'ארגונים', icon: Building2 },
  { href: '/admin/users', label: 'משתמשים', icon: Users },
  { href: '/admin/audit-log', label: 'יומן פעולות', icon: ScrollText },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#1A1825] border-l border-[rgba(78,168,222,0.15)] h-screen sticky top-0">
      <div className="flex flex-col h-full">
        <div className="px-6 py-6 border-b border-[rgba(78,168,222,0.15)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#4EA8DE] flex items-center justify-center">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-[#F5F1EB] text-sm leading-tight">פאנל ניהול</p>
              <p className="text-[#9B9AAF] text-xs">ניהול הפלטפורמה</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  active
                    ? 'bg-[#4EA8DE]/15 text-[#4EA8DE] border border-[#4EA8DE]/20'
                    : 'text-[#9B9AAF] hover:bg-[#221F30] hover:text-[#F5F1EB]'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[rgba(78,168,222,0.15)]">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm text-[#9B9AAF] hover:bg-[#221F30] hover:text-[#F5F1EB] transition-all"
          >
            <ArrowRight size={18} />
            חזרה לאפליקציה
          </Link>
        </div>
      </div>
    </aside>
  )
}
