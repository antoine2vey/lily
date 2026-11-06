import { fmt } from '@/i18n'
import type { Messages } from '@/i18n/en'
import type { Engine } from '../live'

const pad = (n: number) => String(n).padStart(2, '0')

// One review at a time, with prev and next buttons and a progress bar.
export const mount: Engine<Messages['Proof']> = (root, t) => {
  const quotes = [...root.querySelectorAll<HTMLElement>('.m-quote')]
  const count = root.querySelector<HTMLElement>('[data-count]')
  const bar = root.querySelector<HTMLElement>('[data-bar]')
  const prev = root.querySelector<HTMLButtonElement>('[data-prev]')
  const next = root.querySelector<HTMLButtonElement>('[data-next]')
  const total = quotes.length
  let q = 0
  const show = (n: number) => {
    q = (n + total) % total
    quotes.forEach((el, k) => {
      el.classList.toggle('is-on', k === q)
      el.setAttribute('aria-hidden', String(k !== q))
    })
    if (count)
      count.textContent = fmt(t.count, { n: pad(q + 1), total: pad(total) })
    bar?.style.setProperty('--q', ((q + 1) / total).toFixed(3))
  }
  const back = () => show(q - 1)
  const forward = () => show(q + 1)
  prev?.addEventListener('click', back)
  next?.addEventListener('click', forward)
  show(0)
  return () => {
    prev?.removeEventListener('click', back)
    next?.removeEventListener('click', forward)
  }
}
