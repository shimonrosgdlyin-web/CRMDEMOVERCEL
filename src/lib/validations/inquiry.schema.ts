import { z } from 'zod'

export const inquirySchema = z.object({
  client_id: z.string().uuid('מזהה לקוח לא תקין'),
  property_id: z.string().uuid('מזהה נכס לא תקין').optional(),
  type: z.enum(['whatsapp', 'email', 'call', 'note']),
  message: z.string().max(5000, 'הודעה ארוכה מדי').optional(),
})

export type InquiryFormData = z.infer<typeof inquirySchema>
