import { z } from 'zod'

/**
 * Wraps a `z.number()` schema so an empty numeric form input is correctly
 * treated as "field not provided" instead of a validation error.
 *
 * Why this exists: every optional numeric field in this codebase is
 * registered in its form with react-hook-form's `valueAsNumber: true` (see
 * PropertyForm.tsx / ClientForm.tsx). That option reads the DOM's native
 * `HTMLInputElement.valueAsNumber`, which per the HTML spec is `NaN` — not
 * `undefined`, not an empty string — when a `type="number"` input is left
 * empty. `NaN` is still JS type `number`, so a plain `.optional()` never
 * treats it as absent (`.optional()` only special-cases `undefined`), and
 * Zod buckets `NaN` as its own parsed type (`"nan"`, distinct from
 * `"number"`), so the field fails with a raw "Expected number, received
 * nan" instead of being accepted as omitted.
 *
 * This preprocesses `NaN -> undefined` *before* Zod's own type check runs,
 * so an empty input is correctly treated as "not provided" and falls through
 * to `.optional()` as intended. A `null`/missing key (e.g. a field entirely
 * absent from a JSON API request body) is untouched and behaves exactly as
 * a plain `.optional()` field already did.
 *
 * Only use this for genuinely optional numeric fields — it is applied
 * per-field, so a required `z.number(...)` left un-wrapped still correctly
 * fails validation (with the schema's own `required_error`) on an empty
 * input.
 */
export function optionalNumber<T extends z.ZodNumber>(schema: T) {
  return z.preprocess(
    (val) => (typeof val === 'number' && Number.isNaN(val) ? undefined : val),
    schema.optional()
  )
}
