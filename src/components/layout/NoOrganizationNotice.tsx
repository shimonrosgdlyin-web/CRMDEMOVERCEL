// Shown by dashboard pages when getCurrentOrgId() returns null — i.e. the
// authenticated user has zero organization_members rows. Shouldn't happen
// for any account created after Stage 3's signup rewrite (login already
// blocks this case with a clear message and signs the user back out — see
// src/app/(auth)/login/page.tsx), but can for pre-existing dev/test
// accounts that predate it, or if a page is reached some other way. A
// graceful message, not a crash or an empty-looking page with no
// explanation. Not the workspace switcher (a later stage) — just an error
// state.
export default function NoOrganizationNotice() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center p-6 text-center">
      <p className="text-[#F5F1EB] font-semibold mb-2">לחשבון זה אין ארגון משויך</p>
      <p className="text-[#9B9AAF] text-sm max-w-sm">
        לא ניתן להציג נתונים ללא ארגון פעיל. נסה להתחבר שוב, ואם הבעיה נמשכת פנה לתמיכה.
      </p>
    </div>
  )
}
