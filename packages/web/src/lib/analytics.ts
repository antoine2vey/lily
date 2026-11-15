const GA_ID = import.meta.env.VITE_GA_ID ?? 'G-YX8RMN49KD'
const GA_QUEUE = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}')`
const DISABLE_FLAG = `ga-disable-${GA_ID}`

const flags = () => window as unknown as Record<string, boolean>

let injected = false

const inject = () => {
  flags()[DISABLE_FLAG] = false
  if (injected) return
  injected = true
  const queue = document.createElement('script')
  queue.text = GA_QUEUE
  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.append(queue, tag)
}

// The tag waits for idle time after the window load event, so it never competes with hydration or the hero bytes.
export const startAnalytics = (): (() => void) => {
  const idle = 'requestIdleCallback' in window
  let id = 0
  const schedule = () => {
    id = idle
      ? requestIdleCallback(inject, { timeout: 5000 })
      : window.setTimeout(inject, 3000)
  }
  if (document.readyState === 'complete') schedule()
  else addEventListener('load', schedule, { once: true })
  return () => {
    removeEventListener('load', schedule)
    if (idle) cancelIdleCallback(id)
    else clearTimeout(id)
  }
}

// Google Analytics sets its cookies on the widest domain it can, so expire them on the host and on each parent domain.
const cookieScopes = (host: string): ReadonlyArray<string> => [
  '',
  ...host
    .split('.')
    .map((_, i, parts) => `; domain=${parts.slice(i).join('.')}`),
]

export const stopAnalytics = () => {
  flags()[DISABLE_FLAG] = true
  for (const pair of document.cookie.split('; ')) {
    const [name = ''] = pair.split('=')
    if (name !== '_ga' && !name.startsWith('_ga_')) continue
    for (const scope of cookieScopes(location.hostname)) {
      // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing from browsers the site supports
      document.cookie = `${name}=; Max-Age=0; path=/${scope}`
    }
  }
}
