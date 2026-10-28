import { spaceGrotesk } from '../fonts'
import { Providers } from '../providers'
import '../globals.css'

export default function JoinLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} font-sans bg-background`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
