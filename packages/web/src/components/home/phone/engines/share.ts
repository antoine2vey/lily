import { String } from 'effect'
import { fmt } from '@/i18n'
import type { Messages } from '@/i18n/en'
import type { Engine } from '../../live'
import { data, el, setup, toaster } from './kit'

type State = 'canopy' | 'invite' | 'pick' | 'picked'

// CanopyScreen: invite a member, pick someone, send. Back on Canopy with a
// toast and a pending invitation.
export const mount: Engine<Messages['Phone']> = (root, { share: t }) => {
  const { c, on, stop } = setup(root)
  const toast = toaster(root, c)
  const send = el<HTMLButtonElement>(root, '[data-send]')
  const set = (st: State) => {
    root.dataset.st = st
  }
  let who = ''

  on('[data-invite]', () => set('invite'))
  on('[data-back]', () => set('canopy'))
  on('[data-pick]', () => set('pick'))
  on('[data-clear]', () => {
    set('invite')
    send.disabled = true
  })
  for (const b of root.querySelectorAll<HTMLElement>('[data-person]')) {
    on(b, () => {
      who = data(b, 'person')
      el(root, '[data-sel]').textContent = who
      el(root, '[data-sel-av]').textContent = String.takeLeft(who, 1)
      set('picked')
      send.disabled = false
    })
  }
  on(send, () => {
    el(root, '[data-pend-nm]').textContent = who
    el(root, '[data-pend-av]').textContent = String.takeLeft(who, 1)
    el(root, '[data-until]').textContent = t.until
    send.disabled = true
    set('canopy')
    root.classList.add('has-pend')
    c.later(250, () => toast(fmt(t.sent, { name: who })))
  })
  return stop
}
