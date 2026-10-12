'use client'

import { createClient } from '@/lib/supabase/client'
import { safeRedirectPath } from '@/lib/utils'

interface GoogleSignInButtonProps {
  label: string
  disabled?: boolean
  onError: (message: string) => void
}

/**
 * Shared "Sign in with Google" button for login/page.tsx and register/page.tsx —
 * both entry points use the exact same OAuth call and land on the same
 * /auth/callback route handler (OAuth sign-in creates the account automatically
 * via the existing handle_new_user() trigger on auth.users, so there's no
 * separate "register with Google" flow to build).
 *
 * signInWithOAuth() itself only fails client-side in rare cases (e.g. the
 * provider isn't configured in the Supabase dashboard) — most real failures
 * happen later, server-side, in /auth/callback (code exchange, org
 * resolution), which redirects back to /login?error=oauth_failed instead.
 * Both cases funnel into the same fixed, generic Hebrew message — never the
 * raw SDK error — same "never display raw backend error text" rule as the
 * rest of this directory (see (auth)/CLAUDE.md).
 *
 * Reads window.location.search for the `?redirect=` param INSIDE the click
 * handler, not during render — same reason login/page.tsx's own
 * getRedirectTarget() is only ever called from an event handler (a plain
 * onClick, not a render-time href): reading window during render would
 * differ between the server-rendered HTML and the client-hydrated render,
 * causing a React hydration mismatch. See (auth)/CLAUDE.md's
 * "Redirect-back" section.
 */
export default function GoogleSignInButton({ label, disabled, onError }: GoogleSignInButtonProps) {
  const supabase = createClient()

  async function handleClick() {
    const redirectTarget = safeRedirectPath(
      new URLSearchParams(window.location.search).get('redirect')
    )

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTarget)}`,
      },
    })

    if (error) {
      console.error('supabase.auth.signInWithOAuth failed:', error)
      onError('אירעה שגיאה, נסה שנית')
    }
    // On success the browser navigates away to Google immediately — nothing
    // further to do here; the redirect back to the app is handled entirely
    // by /auth/callback.
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] font-semibold flex items-center justify-center gap-2 hover:bg-[#1F1D2E] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.75z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.76 0 3.35.6 4.6 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.1C6.22 6.86 8.87 4.75 12 4.75z"
        />
      </svg>
      <span>{label}</span>
    </button>
  )
}
