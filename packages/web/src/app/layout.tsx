import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import '@/app/globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Lily - Your plants, thriving',
  description:
    'The smart plant care companion that remembers when you forget. AI-powered identification, weather-aware reminders, and expert advice.',
  keywords: [
    'plant care',
    'plant identification',
    'watering reminders',
    'AI plant app',
    'gardening',
  ],
  openGraph: {
    title: 'Lily - Your plants, thriving',
    description:
      'The smart plant care companion that remembers when you forget.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="font-sans antialiased bg-background text-text-primary">
        {children}
      </body>
    </html>
  )
}
