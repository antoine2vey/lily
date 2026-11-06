import { Array, Option, pipe } from 'effect'
import type { Messages } from '@/i18n/en'
import type { Engine } from '../../live'
import { DOT, GLYPH, isKind, type Kind } from '../kinds'
import { data, el, icon, setup } from './kit'

// CareHistoryScreen: the + opens Log Care, Save Log closes it and the entry
// tops the timeline.
export const mount: Engine<Messages['Phone']> = (root, { log: t }) => {
  const { c, on, stop } = setup(root)
  const tl = el(root, '[data-tl]')
  const types = Array.fromIterable(
    root.querySelectorAll<HTMLButtonElement>('[data-type]')
  )
  const chosen = () =>
    pipe(
      Array.findFirst(types, (b) => b.getAttribute('aria-checked') === 'true'),
      Option.map((b) => data(b, 'type')),
      Option.filter(isKind)
    )
  const close = () => root.classList.remove('is-open')

  on('[data-fab]', () => root.classList.add('is-open'))
  on('[data-close]', close)
  on('[data-scrim]', close)
  for (const b of types) {
    on(b, () => {
      for (const x of types) x.setAttribute('aria-checked', String(x === b))
    })
  }

  const save = (kind: Kind) => {
    close()
    c.later(420, () => {
      const ev = `<div class="m-a-ev"><span class="m-a-rail"><i></i><span class="m-a-dot ${DOT[kind]}">${icon(GLYPH[kind], 20)}</span><i></i></span><div class="m-a-evc no-notes"><p><b>${t.logged[kind]}</b><time>${t.time}</time></p></div></div>`
      const first = tl.firstElementChild
      if (first instanceof HTMLElement && first.dataset.today) {
        el(first, '.m-a-gd').insertAdjacentHTML('afterend', ev)
        return
      }
      tl.insertAdjacentHTML(
        'afterbegin',
        `<div class="m-a-grp is-new" data-today="1"><b class="m-a-gd">${t.today}</b>${ev}</div>`
      )
    })
  }
  on('[data-save]', () =>
    Option.match(chosen(), { onNone: () => undefined, onSome: save })
  )
  return stop
}
