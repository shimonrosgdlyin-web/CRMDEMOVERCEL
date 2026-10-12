import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CRM נדל"ן',
  description: 'מערכת ניהול לקוחות ונכסי נדל"ן',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
