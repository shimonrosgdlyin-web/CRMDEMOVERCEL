import { z } from 'zod'
import { optionalNumber } from './common'

export const propertySchema = z.object({
  title: z.string().min(1, 'נדרש שם נכס').max(200, 'שם ארוך מדי').trim(),
  type: z.enum(['apartment', 'house', 'penthouse', 'land', 'office'], {
    required_error: 'נדרש סוג נכס',
  }),
  price: z
    .number({ required_error: 'נדרש מחיר', invalid_type_error: 'מחיר לא תקין' })
    .positive('מחיר חייב להיות חיובי')
    .max(1_000_000_000, 'מחיר גבוה מדי'),
  address: z.string().min(1, 'נדרשת כתובת').max(300, 'כתובת ארוכה מדי').trim(),
  city: z.string().min(1, 'נדרשת עיר').max(100, 'שם עיר ארוך מדי').trim(),
  // optionalNumber: empty type="number" input -> valueAsNumber gives NaN,
  // not undefined -> must preprocess before .optional() sees it (see common.ts)
  rooms: optionalNumber(z.number().min(0).max(50)),
  size_sqm: optionalNumber(z.number().positive('גודל חייב להיות חיובי').max(10000)),
  floor: optionalNumber(z.number().int().min(-5).max(200)),
  parking: z.boolean().default(false),
  elevator: z.boolean().default(false),
  description: z.string().max(2000, 'תיאור ארוך מדי').trim().optional(),
  status: z
    .enum(['available', 'pending', 'rented', 'sold'])
    .default('available'),
})

export type PropertyFormData = z.infer<typeof propertySchema>

// GET /api/properties query-string filters — searchParams arrive as
// strings, so numeric filters use z.coerce.number() (an unparseable value
// fails validation here instead of becoming NaN and reaching Postgres as a
// type-cast error that leaked the raw DB message — security-review finding,
// 2026-08-30). type/status are validated against the same enums as the
// write-side schema above rather than passed straight to .eq() unchecked.
export const propertyFilterSchema = z.object({
  city: z.string().trim().max(100).optional(),
  type: z.enum(['apartment', 'house', 'penthouse', 'land', 'office']).optional(),
  status: z.enum(['available', 'pending', 'rented', 'sold']).optional(),
  price_min: z.coerce.number().nonnegative().optional(),
  price_max: z.coerce.number().nonnegative().optional(),
  rooms_min: z.coerce.number().min(0).max(50).optional(),
})
