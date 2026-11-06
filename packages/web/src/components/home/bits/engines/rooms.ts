import { Array, Option } from 'effect'
import { plural } from '@/i18n'
import type { Messages } from '@/i18n/en'
import { type Engine, reducedMotion, whileVisible } from '../../live'
import { pageLocale, q } from './dom'

// A CSS animation only restarts once the class is gone and layout has run.
const replay = (el: HTMLElement, cls: string) => {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

// Pothos goes from no room to the Living Room, then the Bedroom, then out
// again: each step lists [room index, delta].
const MOVES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 1]],
  [
    [0, -1],
    [1, 1],
  ],
  [[1, -1]],
]

export const mount: Engine<Messages['Bits']> = (root, t) => {
  if (reducedMotion()) return () => {}
  const locale = pageLocale()
  const live = q(root, '[data-rooms]')
  const rooms = Array.map(
    Array.zip(
      [...live.querySelectorAll<HTMLElement>('.m-ap-room')],
      t.rooms.items
    ),
    ([row, item]) => ({ row, count: q(row, '[data-count]'), n: item.count })
  )
  let step = 0
  const tick = () => {
    for (const [i, d] of Option.getOrElse(Array.get(MOVES, step), () => [])) {
      const room = rooms[i]
      if (!room) continue
      room.n += d
      room.count.textContent = plural(locale, room.n, t.rooms.plants)
      replay(room.count, 'is-tick')
      replay(room.row, 'is-hit')
    }
    step = (step + 1) % MOVES.length
  }
  live.classList.add('is-live')
  return whileVisible(live, () => {
    const timer = setInterval(tick, 2400)
    return () => clearInterval(timer)
  })
}
