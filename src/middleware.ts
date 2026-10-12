import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { CURRENT_ORG_COOKIE } from '@/lib/org/current-org'

type CookieEntry = { name: string; value: string; options?: Record<string, unknown> }

// CURRENT_ORG_HEADER forwards the raw current-org cookie value as a request
// header, so downstream Server Components/Route Handlers have exactly one
// consistent way to read "what did the request arrive with" if they ever
// need it (mirroring how src/lib/supabase/server.ts centralizes auth-cookie
// reading rather than every consumer reading cookies() ad hoc).
//
// Deliberately NOT validated here against organization_members — that
// would mean a DB round-trip on every single request through this
// middleware (including static-ish navigations), for a value every actual
// consumer already re-validates anyway (see resolveCurrentOrg / the
// explicit "still validate ... rather than trusting the cookie value
// blindly" requirement this was built against). Real validation happens
// once, at the point of use, via src/lib/org/current-org.ts's
// resolveCurrentOrg()/getCurrentOrgId() — called from each Server Component
// and API route that actually needs to scope a query by it, not here.
export const CURRENT_ORG_HEADER = 'x-current-org-id'

export async function middleware(request: NextRequest) {
  // Build the forwarded-request headers once, reused by every
  // NextResponse.next({ request: { headers } }) call below (mirrors the
  // documented Next.js pattern for passing a value from middleware to
  // downstream Server Components/Route Handlers via next/headers' headers()).
  const requestHeaders = new Headers(request.headers)
  const currentOrgId = request.cookies.get(CURRENT_ORG_COOKIE)?.value
  if (currentOrgId) {
    requestHeaders.set(CURRENT_ORG_HEADER, currentOrgId)
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieEntry[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as never)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuth = pathname.startsWith('/login') || pathname.startsWith('/register')
  // '/' used to be excluded here (fail-open — an unauthenticated request to
  // the dashboard home never hit the redirect below, unlike every other
  // protected route). No data actually leaked (the page itself no-ops with
  // no session), but it's an inconsistent gate a future page could land
  // behind with nothing catching it — security-review finding, 2026-08-30.
  const isDashboard = !isAuth

  if (!user && isDashboard) {
    const url = request.nextUrl.clone()
    const originalPath = url.pathname + url.search
    url.pathname = '/login'
    url.search = ''
    // Preserve where the visitor was headed (e.g. /accept-invite?token=...)
    // so login/register can send them back after success. login/register
    // validate this via safeRedirectPath() before ever using it — never
    // trust it blindly, this is exactly the shape of an open-redirect
    // param if it weren't re-validated downstream.
    if (originalPath && originalPath !== '/') {
      url.searchParams.set('redirect', originalPath)
    }
    return NextResponse.redirect(url)
  }

  if (user && isAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // auth/callback/ is excluded for the same reason api/ is: it's a Route
  // Handler, not a page, and it's specifically the route that ESTABLISHES a
  // session (Google OAuth code exchange) — by the time it runs, the visitor
  // has authenticated with Google but has no Supabase session/cookies yet,
  // so this middleware's unauthenticated -> /login redirect must never
  // intercept it (that would make OAuth sign-in structurally impossible).
  // See src/app/auth/callback/route.ts.
  //
  // "auth/callback(?:/|$)" (not a bare "auth/callback") — a bare literal
  // would also match as a *prefix*, silently excluding lookalikes like
  // auth/callback-evil or auth/callbacks/admin from the auth gate the day
  // someone adds a sibling route under auth/. Anchoring to end-of-string or
  // a following slash keeps this scoped to exactly this one route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|auth/callback(?:/|$)).*)'],
}
