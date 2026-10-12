import { redirect } from 'next/navigation'
import MfaEnrollForm from '@/components/admin/MfaEnrollForm'
import { requirePlatformAdminGrantPage } from '@/lib/admin/require-platform-admin'

/**
 * The ONLY page under /admin that does not require aal2 — it is how a platform
 * admin gets to aal2 in the first place. Gating this on MFA would be a
 * chicken-and-egg lock on the whole panel.
 *
 * It still requires a session AND a platform_admins grant, so it is not open:
 * a non-admin gets the same 404 as anywhere else in the panel (enforced by the
 * layout, and again here).
 *
 * An admin who is ALREADY at aal2 has no business here — send them on.
 */
export default async function AdminMfaPage() {
  const { isAal2 } = await requirePlatformAdminGrantPage()
  if (isAal2) redirect('/admin')

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-[rgba(78,168,222,0.15)] px-6 py-4">
        <h1 className="text-xl font-bold text-[#F5F1EB]">אימות דו-שלבי</h1>
      </div>

      <div className="p-6">
        <div className="max-w-md bg-[#1A1825] rounded-2xl border border-[rgba(78,168,222,0.15)] p-6">
          <p className="text-sm text-[#9B9AAF] mb-5 leading-relaxed">
            פאנל הניהול נותן גישה לנתוני כל הלקוחות בפלטפורמה, ולכן הוא דורש אימות דו-שלבי.
            הדרישה נאכפת במסד הנתונים עצמו — לא רק כאן — כך שגם עקיפה של הממשק לא מקנה גישה.
          </p>

          <MfaEnrollForm alreadyVerified={false} />
        </div>
      </div>
    </div>
  )
}
