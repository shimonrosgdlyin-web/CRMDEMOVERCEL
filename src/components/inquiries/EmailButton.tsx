'use client'

import { Mail } from 'lucide-react'
import type { Client, Property } from '@/types'
import { PROPERTY_TYPE_LABELS } from '@/types'
import { formatPrice } from '@/lib/utils'

interface Props {
  client: Client
  property: Property
}

export default function EmailButton({ client, property }: Props) {
  function handleClick() {
    if (!client.email) {
      alert('ללקוח זה אין כתובת מייל')
      return
    }

    const subject = encodeURIComponent(`נכס שעשוי להתאים לך: ${property.title}`)
    const body = encodeURIComponent(
      `שלום ${client.name},\n\nמצאתי עבורך ${PROPERTY_TYPE_LABELS[property.type]} שעשוי להתאים לדרישותיך:\n\n` +
      `${property.title}\n${property.address}, ${property.city}\nמחיר: ${formatPrice(property.price)}\n` +
      `${property.rooms ? `חדרים: ${property.rooms}\n` : ''}` +
      `${property.description ? `\n${property.description.slice(0, 300)}\n` : ''}` +
      `\nנשמח לתאם ביקור. צור/י קשר.`
    )

    // Log the inquiry
    fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client.id,
        property_id: property.id,
        type: 'email',
      }),
    }).catch(() => {})

    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${subject}&body=${body}`
  }

  return (
    <button
      onClick={handleClick}
      disabled={!client.email}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      title={client.email ? 'שלח מייל' : 'אין כתובת מייל'}
    >
      <Mail size={15} />
      מייל
    </button>
  )
}
