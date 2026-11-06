import { Option, pipe } from 'effect'
import { reducedMotion } from '../../live'

export interface Clock {
  // A step of the demo. Reduced motion caps it at 60ms, like B's `later`.
  readonly later: (ms: number, fn: () => void) => number
  // A window the user relies on (undo, toast). Never capped.
  readonly wait: (ms: number, fn: () => void) => number
  readonly cancel: (id: number) => void
  readonly stop: () => void
}

const clock = (): Clock => {
  const ids = new Set<number>()
  const at = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      ids.delete(id)
      fn()
    }, ms)
    ids.add(id)
    return id
  }
  return {
    later: (ms, fn) => at(reducedMotion() ? Math.min(ms, 60) : ms, fn),
    wait: at,
    cancel: (id) => {
      window.clearTimeout(id)
      ids.delete(id)
    },
    stop: () => {
      for (const id of ids) window.clearTimeout(id)
      ids.clear()
    },
  }
}

export const el = <T extends Element = HTMLElement>(
  root: ParentNode,
  sel: string
): T => {
  const found = root.querySelector<T>(sel)
  if (!found) throw new Error(`phone engine: missing ${sel}`)
  return found
}

export const data = (e: HTMLElement, key: string): string =>
  pipe(
    Option.fromNullishOr(e.dataset[key]),
    Option.getOrElse(() => '')
  )

export const icon = (name: string, size: number): string =>
  `<svg class="i" style="--s:${size}px" aria-hidden="true"><use href="#mi-${name}"/></svg>`

// One engine's timers and listeners, released together by `stop`.
export const setup = (root: HTMLElement) => {
  const c = clock()
  const ac = new AbortController()
  const on = (target: Element | string, fn: (e: Event) => void) =>
    (typeof target === 'string' ? el(root, target) : target).addEventListener(
      'click',
      fn,
      { signal: ac.signal }
    )
  return {
    c,
    on,
    signal: ac.signal,
    stop: () => {
      ac.abort()
      c.stop()
    },
  }
}

// Shows a message in the screen's toast for 3 seconds.
export const toaster = (root: HTMLElement, c: Clock) => {
  const box = el(root, '.m-a-toast')
  const text = el(box, '[data-toast]')
  let timer = 0
  return (msg: string) => {
    text.textContent = msg
    box.classList.add('is-show')
    c.cancel(timer)
    timer = c.wait(3000, () => box.classList.remove('is-show'))
  }
}
