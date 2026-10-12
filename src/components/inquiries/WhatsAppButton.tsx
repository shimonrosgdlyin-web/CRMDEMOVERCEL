'use client'

import { MessageCircle } from 'lucide-react'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import type { Client, Property } from '@/types'

interface Props {
  client: Client
  property: Property
}

export default function WhatsAppButton({ client, property }: Props) {
  async function handleClick() {
    if (!client.phone) {
      alert('ללקוח זה אין מספר טלפון')
      return
    }

    // Log the inquiry (fire-and-forget)
    fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client.id,
        property_id: property.id,
        type: 'whatsapp',
      }),
    }).catch(() => {})

    const url = buildWhatsAppUrl(client, property)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      onClick={handleClick}
      disabled={!client.phone}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      title={client.phone ? 'שלח וואטסאפ' : 'אין מספר טלפון'}
    >
      <MessageCircle size={15} />
      וואטסאפ
    </button>
  )
}
