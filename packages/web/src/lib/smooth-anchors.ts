import { useEffect } from 'react'

const MIN_MS = 450
const MAX_MS = 900
const MS_PER_PX = 0.12

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

const sameDocTarget = (e: MouseEvent): HTMLElement | null => {
  if (e.defaultPrevented || e.button !== 0) return null
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null
  if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== '_self'))
    return null
  const url = new URL(a.href)
  if (url.origin !== location.origin || url.pathname !== location.pathname)
    return null
  if (url.hash.length < 2) return null
  return document.getElementById(decodeURIComponent(url.hash.slice(1)))
}

// Native smooth scrolling is near instant over long pages, and content-visibility sections resize mid-flight.
// This re-reads the target every frame, so it lands on the section however the layout settles.
export const useSmoothAnchors = () =>
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const stop = () => cancelAnimationFrame(frame)

    const onClick = (e: MouseEvent) => {
      if (reduce.matches) return
      const el = sameDocTarget(e)
      if (!el) return
      e.preventDefault()
      stop()
      history.replaceState(history.state, '', `#${el.id}`)
      const pad = Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop
      )
      const targetY = () =>
        Math.max(0, el.getBoundingClientRect().top + scrollY - (pad || 0))
      const from = scrollY
      const ms = Math.min(
        MAX_MS,
        Math.max(MIN_MS, Math.abs(targetY() - from) * MS_PER_PX)
      )
      const t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms)
        scrollTo({
          top: from + (targetY() - from) * ease(t),
          behavior: 'instant',
        })
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }

    addEventListener('click', onClick, true)
    addEventListener('wheel', stop, { passive: true })
    addEventListener('touchstart', stop, { passive: true })
    addEventListener('keydown', stop)
    return () => {
      stop()
      removeEventListener('click', onClick, true)
      removeEventListener('wheel', stop)
      removeEventListener('touchstart', stop)
      removeEventListener('keydown', stop)
    }
  }, [])
