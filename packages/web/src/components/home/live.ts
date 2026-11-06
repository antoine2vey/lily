import { type RefObject, useEffect } from 'react'

export type Stop = () => void
export type Engine<T> = (root: HTMLElement, t: T) => Stop
export type Load<T> = () => Promise<{ readonly mount: Engine<T> }>

const NEAR = { rootMargin: '300px 0px' }

// Loads an engine module only once its root comes within 300px of the
// viewport, so the home's initial JS carries no engine code. `data-near`
// gates the CSS screenshot backgrounds the same way. The engine's
// own cleanup runs on unmount.
export function useLive<T>(
  ref: RefObject<HTMLElement | null>,
  load: Load<T>,
  t: T
): void {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let stop: Stop | undefined
    let gone = false
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      io.disconnect()
      root.dataset.near = ''
      load().then(({ mount }) => {
        if (!gone) stop = mount(root, t)
      })
    }, NEAR)
    io.observe(root)
    return () => {
      gone = true
      io.disconnect()
      stop?.()
    }
  }, [ref, load, t])
}

// Runs `tick` only while `el` is on screen. Returns a stop function.
export const whileVisible = (
  el: Element,
  start: () => Stop,
  threshold = 0
): Stop => {
  let stop: Stop | undefined
  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        stop ??= start()
      } else {
        stop?.()
        stop = undefined
      }
    },
    { threshold }
  )
  io.observe(el)
  return () => {
    io.disconnect()
    stop?.()
  }
}

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
