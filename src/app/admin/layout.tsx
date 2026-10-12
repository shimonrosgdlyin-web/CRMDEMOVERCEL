import AdminSidebar from '@/components/admin/AdminSidebar'
import { requirePlatformAdminGrantPage } from '@/lib/admin/require-platform-admin'

export const metadata = {
  title: 'פאנל ניהול | CRM נדל"ן',
}

/**
 * The platform admin panel lives at /admin — its own top-level segment, NOT
 * inside (dashboard)/.
 *
 * That is structural, not stylistic: (dashboard)/layout.tsx calls
 * getCurrentOrgId() and redirects to /setup-organization when it is null, and
 * a platform admin can legitimately belong to ZERO organizations. Nesting the
 * panel there would bounce the operator into a tenant-onboarding flow they
 * must not complete. Same category of reasoning that already put
 * accept-invite/, setup-organization/ and auth/callback/ outside both route
 * groups (see src/app/CLAUDE.md).
 *
 * This layout enforces only the GRANT (session + a platform_admins row), not
 * aal2 — deliberately. /admin/mfa is a child of this layout and must be
 * reachable by an admin who has not enrolled a second factor yet; gating aal2
 * here would make enrollment impossible and lock the panel permanently on
 * first use. Every page except /admin/mfa re-gates on aal2 itself via
 * requirePlatformAdminPage().
 *
 * A visitor with no grant gets notFound() — a real 404. The panel does not
 * confirm its own existence to someone who has no business there.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdminGrantPage()

  return (
    <div className="flex min-h-screen bg-[#0F0E17]">
      <AdminSidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
