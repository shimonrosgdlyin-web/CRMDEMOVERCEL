import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentOrg, setCurrentOrgCookie } from '@/lib/org/current-org'
import { safeRedirectPath } from '@/lib/utils'

// GET /auth/callback?code=...&redirect=...
//
// Landing point for Google OAuth sign-in. login/page.tsx and register/page.tsx's
// GoogleSignInButton call supabase.auth.signInWithOAuth({ provider: 'google' })
// with redirectTo pointing here; Google -> Supabase's own /auth/v1/callback ->
// here, arriving with a `code` query param (PKCE flow, the @supabase/ssr
// default). This route exchanges that code for a session (setting the same
// auth cookies signInWithPassword()'s browser client sets directly), then
// resolves/sets the current-org cookie using the SAME logic
// POST /api/auth/current-org uses — resolveCurrentOrg()/setCurrentOrgCookie()
// (src/lib/org/current-org.ts) are already that route's reusable core, so
// this calls them directly rather than duplicating any org-resolution SQL/
// logic, or looping back through the API route itself.
//
// Deliberately NOT gated by middleware.ts's auth check (see that file's
// matcher) — this route is what ESTABLISHES the session in the first place.
// By the time Google redirects back here, the visitor has authenticated
// with Google but has no Supabase session yet (no auth cookies set) until
// exchangeCodeForSession() below runs; if middleware redirected this
// request to /login first, OAuth sign-in could never complete.
//
// handle_new_user() (001_initial_schema.sql) is a trigger on `auth.users`
// itself, not scoped to any provider — it fires on this exchange's implicit
// user-insert exactly the same way it fires for supabase.auth.signUp(), so
// a brand-new Google sign-in gets its `profiles` row auto-created with no
// extra code needed here. See supabase/CLAUDE.md.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')

  // `redirect` is attacker-controllable input arriving at a server route —
  // a URL to this route can be hand-crafted directly
  // (/auth/callback?code=...&redirect=https://evil.example), bypassing
  // whatever client-side validation login/page.tsx already did before
  // constructing the redirectTo it sent to Google. Always re-validated here
  // too, never trusted just because the client-side code path also
  // sanitizes it — same open-redirect concern safeRedirectPath exists for
  // everywhere else (src/lib/utils.ts).
  const redirectTarget = safeRedirectPath(req.nextUrl.searchParams.get('redirect'))

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url))
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    // Never surface raw Supabase error text — same "generic Hebrew message
    // only" rule as every other auth failure in this app (see
    // (auth)/CLAUDE.md). login/page.tsx renders the same fixed message for
    // ?error=oauth_failed that it already shows for its other failure branches.
    console.error('exchangeCodeForSession failed:', exchangeError)
    // A failed exchange never reaches the point of writing session cookies
    // (PKCE token exchange is atomic — cookies are only set on success), so
    // there's no live session to end here today. signOut() anyway, purely
    // for defensive consistency with the getUser()-failure branch below and
    // to future-proof against any SDK behavior change.
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url))
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('auth.getUser() failed after exchangeCodeForSession:', authError)
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url))
  }

  const { organizationId, hasNoOrganizations } = await resolveCurrentOrg(supabase, user.id)

  if (hasNoOrganizations || !organizationId) {
    // Zero organizations is a real, recoverable state (a brand-new Google
    // sign-in has never gone through /register's org-creation step) — same
    // recovery path login/page.tsx uses for this exact case. Keep the
    // session alive, do NOT sign out.
    return NextResponse.redirect(new URL('/setup-organization', req.url))
  }

  await setCurrentOrgCookie(organizationId)

  return NextResponse.redirect(new URL(redirectTarget, req.url))
}
