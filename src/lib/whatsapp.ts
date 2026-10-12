import { normalizeIsraeliPhone, formatPrice } from '@/lib/utils'
import type { Property, Client } from '@/types'
import { PROPERTY_TYPE_LABELS } from '@/types'

export function buildWhatsAppUrl(client: Client, property: Property): string {
  const phone = normalizeIsraeliPhone(client.phone || '')
  const message = buildWhatsAppMessage(client, property)
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export function buildWhatsAppMessage(client: Client, property: Property): string {
  const type = PROPERTY_TYPE_LABELS[property.type]
  const price = formatPrice(property.price)
  const parking = property.parking ? '✅ כן' : '❌ לא'
  const elevator = property.elevator ? '✅ כן' : '❌ לא'
  const rooms = property.rooms ? `${property.rooms} חדרים` : ''
  const size = property.size_sqm ? `${property.size_sqm} מ"ר` : ''
  const floor = property.floor !== undefined ? `קומה ${property.floor}` : ''
  const details = [rooms, size, floor].filter(Boolean).join(' | ')

  return `שלום ${client.name},

מצאתי עבורך ${type} שעשוי להתאים לדרישותיך:

🏠 ${property.title}
📍 ${property.address}, ${property.city}
💰 ${price}
${details ? `🚪 ${details}\n` : ''}🚗 חניה: ${parking}
🛗 מעלית: ${elevator}
${property.description ? `\n${property.description.slice(0, 150)}${property.description.length > 150 ? '...' : ''}\n` : ''}
נשמח לתאם ביקור בנכס. אנא צור/י קשר.`
}
