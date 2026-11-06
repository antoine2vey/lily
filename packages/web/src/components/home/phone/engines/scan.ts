import type { Messages } from '@/i18n/en'
import type { Engine } from '../../live'
import { el, setup } from './kit'

type State = 'idle' | 'capturing' | 'analyzing' | 'result'

// UnifiedScannerScreen: shutter, then Identifying, Analyzing, and the result pill.
export const mount: Engine<Messages['Phone']> = (root, { scan: t }) => {
  const { c, on, stop } = setup(root)
  const say = el(root, '[data-say]')
  const add = el<HTMLButtonElement>(root, '[data-add]')
  const set = (st: State, text?: string) => {
    root.dataset.st = st
    if (text) say.textContent = text
  }
  const analyze = () => {
    set('analyzing', t.analyzing)
    c.later(1500, () => set('result'))
  }
  const reset = () => {
    c.stop()
    add.textContent = t.add
    add.disabled = false
    set('idle', t.detected)
  }
  on('.m-a-shut', () => {
    if (root.dataset.st !== 'idle') return
    set('capturing', t.identifying)
    c.later(1200, analyze)
  })
  on('[data-reset="again"]', () => {
    c.stop()
    analyze()
  })
  on('[data-reset="close"]', reset)
  on(add, () => {
    add.textContent = t.adding
    add.disabled = true
    c.later(1500, reset)
  })
  return stop
}
