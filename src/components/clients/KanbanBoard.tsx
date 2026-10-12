'use client'

import { useState, useCallback } from 'react'
import type { Client, ClientStatus } from '@/types'
import { CLIENT_STATUS_LABELS } from '@/types'
import KanbanCard from './KanbanCard'

const COLUMNS: ClientStatus[] = ['new', 'contacted', 'meeting', 'offer', 'signed', 'closed']

const COLUMN_COLORS: Record<ClientStatus, string> = {
  new:       'border-blue-500/30 bg-blue-500/5',
  contacted: 'border-purple-500/30 bg-purple-500/5',
  meeting:   'border-yellow-500/30 bg-yellow-500/5',
  offer:     'border-orange-500/30 bg-orange-500/5',
  signed:    'border-green-500/30 bg-green-500/5',
  closed:    'border-gray-500/30 bg-gray-500/5',
}

interface Props {
  initialClients: Client[]
}

export default function KanbanBoard({ initialClients }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [dragging, setDragging] = useState<string | null>(null)

  const grouped = useCallback(
    () =>
      COLUMNS.reduce(
        (acc, status) => {
          acc[status] = clients.filter((c) => c.status === status)
          return acc
        },
        {} as Record<ClientStatus, Client[]>
      ),
    [clients]
  )

  function onDragStart(clientId: string) {
    setDragging(clientId)
  }

  async function onDrop(newStatus: ClientStatus) {
    if (!dragging) return
    const prev = clients.find((c) => c.id === dragging)
    if (!prev || prev.status === newStatus) {
      setDragging(null)
      return
    }

    // Optimistic update
    setClients((cs) => cs.map((c) => (c.id === dragging ? { ...c, status: newStatus } : c)))
    setDragging(null)

    // Persist
    await fetch(`/api/clients/${dragging}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  const groups = grouped()

  return (
    <div className="kanban-scroll pb-4">
      <div className="flex gap-4 min-w-max">
        {COLUMNS.map((status) => (
          <div
            key={status}
            className={`w-60 rounded-2xl border ${COLUMN_COLORS[status]} p-3 flex flex-col gap-2 min-h-[200px]`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(status)}
          >
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-sm font-semibold text-[#F5F1EB]">
                {CLIENT_STATUS_LABELS[status]}
              </span>
              <span className="text-xs text-[#9B9AAF] bg-[#221F30] rounded-full px-2 py-0.5">
                {groups[status].length}
              </span>
            </div>

            {groups[status].map((client) => (
              <KanbanCard
                key={client.id}
                client={client}
                onDragStart={() => onDragStart(client.id)}
              />
            ))}

            {groups[status].length === 0 && (
              <div className="flex-1 flex items-center justify-center text-xs text-[#6B6A7F] py-4">
                גרור לכאן
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
