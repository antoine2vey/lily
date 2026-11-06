import { Array } from 'effect'
import { plural } from '@/i18n'
import type { Messages } from '@/i18n/en'
import { type Engine, reducedMotion, whileVisible } from '../../live'
import { pageLocale, q } from './dom'

type Write = (el: Element, text: string) => void

const EASE = 'cubic-bezier(.2,.8,.2,1)'
const span = (text: string) =>
  Object.assign(document.createElement('span'), { textContent: text })
const put: Write = (el, text) => el.replaceChildren(span(text))

// Tasks get done in widget order (the app sorts by days late, then name). The
// widget and the Live Activity redraw from the same pending list in the same
// frame; at zero the widget shows its all done state and the activity ends.
export const mount: Engine<Messages['Bits']> = (root, t) => {
  if (reducedMotion()) return () => {}
  const locale = pageLocale()
  const T = t.home
  const N = T.queue.length
  const home = q(root, '[data-home]')
  const w = q(home, '.m-ap-widget')
  const la = q(home, '[data-la]')
  const rows = [
    ...w.querySelectorAll<HTMLElement>('[data-rows] > li:not(.more)'),
  ]
  const more = q(w, '[data-more]')
  const moreRow = q(w, '[data-rows] > li.more')
  const num = q(w, '[data-n]')
  const cap = q(w, '[data-cap]')
  const head = q(la, '[data-head]')
  const pills = Array.map(
    [...la.querySelectorAll<HTMLElement>('[data-pill]')],
    (p) => ({ p, b: q(p, 'b'), type: p.dataset.pill })
  )
  const bars = [...home.querySelectorAll<HTMLElement>('[data-bar]')]

  const anims = new Set<Animation>()
  const animate = (el: Element, frames: Keyframe[], onfinish?: () => void) => {
    const a = el.animate(frames, { duration: 450, easing: EASE, fill: 'both' })
    anims.add(a)
    a.onfinish = () => {
      anims.delete(a)
      onfinish?.()
    }
  }
  const roll: Write = (el, text) => {
    const cur = el.lastElementChild
    if (!cur || cur.textContent === text) return
    const next = span(text)
    el.append(next)
    animate(
      cur,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-55%)' },
      ],
      () => cur.remove()
    )
    animate(next, [
      { opacity: 0, transform: 'translateY(55%)' },
      { opacity: 1, transform: 'none' },
    ])
  }
  for (const el of [num, cap, more, head, ...Array.map(pills, (x) => x.b)]) {
    el.classList.add('m-roll')
    put(el, el.textContent ?? '')
  }

  let k = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const draw = (set: Write) => {
    const left = Array.drop(T.queue, k)
    const n = left.length
    rows.forEach((r, i) => {
      r.classList.toggle('is-gone', i < k || i >= k + 3)
      r.classList.toggle('is-done', i < k)
      r.classList.toggle('is-ticked', i < k)
    })
    moreRow.classList.toggle('is-gone', n <= 3)
    if (n > 3) set(more, plural(locale, n - 3, T.more))
    for (const bar of bars) {
      bar.style.setProperty('--p', `${((1 + k) / (1 + N)) * 100}%`)
    }
    w.classList.toggle('is-done', !n)
    la.classList.toggle('is-ended', !n)
    if (!n) return
    w.classList.toggle(
      'is-ontime',
      Array.every(left, (task) => !task.late)
    )
    set(num, String(n))
    set(cap, plural(locale, n, T.caption))
    set(head, plural(locale, n, T.activity.headline))
    for (const { p, b, type } of pills) {
      const c = Array.filter(left, (task) => task.type === type).length
      p.classList.toggle('is-gone', !c)
      if (c) set(b, String(c))
    }
  }
  const next = () => (k === N ? restart() : tick())
  const tick = () => {
    rows[k]?.classList.add('is-ticked')
    timer = setTimeout(() => {
      k++
      draw(roll)
      timer = setTimeout(next, k === N ? 3600 : 1800)
    }, 400)
  }
  // Rebuild the start state behind the done layer and the ended activity,
  // then cross-fade back.
  const restart = () => {
    k = 0
    home.classList.add('is-reset')
    rows.forEach((r, i) => {
      r.classList.toggle('is-gone', i >= 3)
      r.classList.remove('is-done', 'is-ticked')
    })
    void home.offsetWidth
    home.classList.remove('is-reset')
    draw(put)
    timer = setTimeout(next, 2000)
  }

  home.classList.add('is-live')
  return whileVisible(home, () => {
    timer = setTimeout(next, 900)
    return () => {
      clearTimeout(timer)
      timer = undefined
      for (const a of anims) a.finish()
    }
  })
}
