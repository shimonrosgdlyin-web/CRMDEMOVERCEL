// Pure render, no interactivity — same shape as ClientStatusBadge.
export default function SuspensionBadge({ suspendedAt }: { suspendedAt: string | null }) {
  if (!suspendedAt) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400">
        פעיל
      </span>
    )
  }

  return (
    <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">
      מושעה
    </span>
  )
}
