import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(price)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

export function formatRelativeTime(dateStr: string): string {
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
  const diff = (new Date(dateStr).getTime() - Date.now()) / 1000
  const absDiff = Math.abs(diff)

  if (absDiff < 60) return rtf.format(Math.round(diff), 'second')
  if (absDiff < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (absDiff < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  return '972' + digits
}

/**
 * Validates a `?redirect=` value (used by middleware.ts's post-login return
 * path, e.g. for /accept-invite) is a same-origin relative path before it's
 * ever used in a router.push() — an unvalidated redirect target taken
 * straight from a query param is a classic open-redirect vector.
 *
 * Deliberately does NOT hand-roll prefix checks (e.g. "starts with '/' and
 * not '//'") — a first version of this function did exactly that and
 * missed a real bypass (security-reviewer + qa-engineer, ct-5b91e0d3):
 * `/\evil.example` starts with `/` and not `//`, so it passed, but the
 * WHATWG URL parser (which is what browsers actually use, and what
 * router.push()'s underlying navigation follows) treats a backslash the
 * same as a forward slash for http/https, so `/\evil.example` parses as
 * protocol-relative to `evil.example` — functionally identical to
 * `//evil.example`. Rather than enumerate that bypass and the next one
 * someone finds, this parses `raw` with the real URL parser against a
 * placeholder base and requires TWO things to hold: (1) the parsed result's
 * origin is still the placeholder's (nothing in `raw` changed the
 * scheme/host/port), and (2) the parsed result's path+search+hash
 * round-trips back to exactly `raw` (nothing in `raw` got silently
 * reinterpreted/normalized into something different — this is what would
 * catch the backslash case, and any other normalization quirk, without
 * needing to know about it in advance). Falls back to '/' unless both hold.
 *
 * No unit test runner exists yet in this project (see crm/CLAUDE.md) — if
 * one is added, this needs a regression test covering at least:
 * '/accept-invite?token=x' (valid, must pass through unchanged),
 * '//evil.example', '/\\evil.example', 'https://evil.example',
 * and '' / null / undefined (all -> '/').
 */
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return '/'

  const PLACEHOLDER_ORIGIN = 'http://placeholder.invalid'

  let parsed: URL
  try {
    parsed = new URL(raw, PLACEHOLDER_ORIGIN)
  } catch {
    return '/'
  }

  if (parsed.origin !== PLACEHOLDER_ORIGIN) return '/'

  const roundTrip = parsed.pathname + parsed.search + parsed.hash
  if (roundTrip !== raw) return '/'

  return raw
}
