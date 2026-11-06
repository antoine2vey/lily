import { Array, String } from 'effect'
import type { Messages } from '@/i18n/en'
import type { Engine } from '../../live'
import { el, setup } from './kit'

type State = 'empty' | 'typing' | 'ready' | 'sent'
type Who = 'me' | 'lily'

// ChatScreen: the question types into the field, send posts it, Lily shows
// the typing dots, then streams the answer.
export const mount: Engine<Messages['Phone']> = (root, { ask: t }) => {
  const { c, on, stop } = setup(root)
  const msgs = el(root, '[data-msgs]')
  const field = el(root, '[data-field]')
  const val = el(root, '[data-val]')
  const send = el<HTMLButtonElement>(root, '[data-send]')
  let state: State = 'empty'

  const row = (who: Who, inner: string) => {
    const m = document.createElement('div')
    m.className = `m-a-msg ${who} is-new`
    m.innerHTML =
      who === 'me'
        ? `<div>${inner}</div><span class="m-a-av">${t.meAv}</span>`
        : `<span class="m-a-av">${t.lilyAv}</span><div>${inner}</div>`
    msgs.append(m)
    return m
  }

  on(field, () => {
    if (state !== 'empty') return
    state = 'typing'
    field.classList.add('has-val', 'is-typing')
    let n = 0
    const type = () => {
      n += 1
      val.textContent = String.takeLeft(t.question, n)
      if (n < t.question.length) {
        c.later(38, type)
        return
      }
      state = 'ready'
      send.disabled = false
    }
    c.later(200, type)
  })

  on(send, () => {
    if (state !== 'ready') return
    state = 'sent'
    send.disabled = true
    field.classList.remove('has-val', 'is-typing')
    val.textContent = ''
    const p = document.createElement('p')
    p.className = 'm-a-bub'
    p.textContent = t.question
    row('me', `${p.outerHTML}<time>${t.time}</time>`)
    c.later(500, () => {
      const dots = row(
        'lily',
        `<p class="m-a-typing" aria-label="${t.typing}"><i></i><i></i><i></i></p>`
      )
      c.later(1600, () => {
        dots.remove()
        const m = row('lily', `<p class="m-a-bub"></p><time>${t.time}</time>`)
        const bub = el(m, '.m-a-bub')
        const words = String.split(t.answer, ' ')
        let k = 0
        const stream = () => {
          k += 1
          bub.textContent = Array.join(Array.take(words, k), ' ')
          if (k < words.length) c.later(55, stream)
        }
        stream()
      })
    })
  })
  return stop
}
