import { fmt } from '@/i18n'
import type { Messages } from '@/i18n/en'
import { type Engine, reducedMotion } from '../../live'
import { q } from './dom'

// Bring back: the toast confirms, the card leaves, and with none left the
// empty state shows.
export const mount: Engine<Messages['Bits']> = (root, t) => {
  const cem = q(root, '[data-cem]')
  const grave = q(cem, '[data-grave]')
  const empty = q(cem, '[data-empty]')
  const toast = q(cem, '.m-ap-toast')
  const toastText = q(cem, '[data-toast]')
  const back = q<HTMLButtonElement>(cem, '[data-back]')
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const later = (ms: number, fn: () => void) =>
    timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 60) : ms))
  back.onclick = () => {
    back.disabled = true
    toastText.textContent = fmt(t.cemetery.toast, {
      name: t.cemetery.plant.name,
    })
    toast.classList.add('is-on')
    grave.classList.add('is-gone')
    later(350, () => {
      grave.hidden = true
      empty.hidden = false
    })
    later(2600, () => toast.classList.remove('is-on'))
  }
  return () => {
    back.onclick = null
    for (const id of timers) clearTimeout(id)
  }
}
