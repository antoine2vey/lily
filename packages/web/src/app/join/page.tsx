import type { Metadata } from 'next'
import { JoinInvite } from '@/components/JoinInvite'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'

const { metaTitle: title, metaDescription: description } = en.Join

export const metadata: Metadata = {
  metadataBase: new URL('https://withlily.app'),
  title,
  description,
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title,
    description,
    siteName: 'Lily',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-image.png'],
  },
}

export default function JoinPage() {
  return <JoinInvite messages={{ en: en.Join, fr: fr.Join }} />
}
