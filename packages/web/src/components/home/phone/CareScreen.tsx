import { Array } from 'effect'
import { useRef } from 'react'
import { useI18n } from '@/i18n'
import type { Messages } from '@/i18n/en'
import { useLive } from '../live'
import { GLYPH, type Kind } from './kinds'
import { cssVars, Mi, type ScreenProps, screenClass, Toast } from './ui'

const load = () => import('./engines/care')

type Plant = keyof Messages['Phone']['care']['plant']
type Room = keyof Messages['Phone']['care']['room']

interface Task {
  readonly plant: Plant
  readonly room?: Room
  readonly kind: Kind
  // Offset into the care-schedule screenshot the task photo crops from.
  readonly sx: number
  readonly sy: number
}

const ROOM_EMOJI: Record<Room, string> = {
  balcony: '☀️',
  bedroom: '🛏️',
  living: '🛋️',
}

// Badge glyph colour on tasks that are not late, as B sets them.
const INFO_COLOR: Record<Kind, string> = {
  watering: '#60A5FA',
  fertilization: '#F59E0B',
  misting: '#60A5FA',
  repotting: '#F59E0B',
}

const OVERDUE: readonly Task[] = [
  { plant: 'snake', room: 'balcony', kind: 'watering', sx: 92.5, sy: 304.5 },
  { plant: 'pothos', kind: 'watering', sx: 92, sy: 409.5 },
  { plant: 'fern', room: 'bedroom', kind: 'watering', sx: 92, sy: 514.5 },
  {
    plant: 'monstera',
    room: 'living',
    kind: 'fertilization',
    sx: 92,
    sy: 619.5,
  },
]
const TODAY: readonly Task[] = [
  { plant: 'fiddle', room: 'living', kind: 'fertilization', sx: 91, sy: 803 },
]
const UPCOMING: readonly Task[] = [
  { plant: 'fern', room: 'bedroom', kind: 'misting', sx: 90.5, sy: 1013.5 },
  { plant: 'peace', room: 'living', kind: 'misting', sx: 90.5, sy: 1108.5 },
]

function TaskRow({
  task,
  late,
  live,
}: {
  task: Task
  late: boolean
  live: boolean
}) {
  const t = useI18n().m.Phone.care
  return (
    <li>
      <div
        {...(live ? { role: 'button', tabIndex: 0 } : {})}
        className={late ? 'm-a-task is-late' : 'm-a-task'}
        data-name={t.plant[task.plant]}
        data-done={t.done[task.kind]}
      >
        <span
          className="m-a-ph"
          style={cssVars({ '--sx': task.sx, '--sy': task.sy })}
        />
        <span className="m-a-tb">
          <span className="m-a-tn">
            <b>{t.plant[task.plant]}</b>
            {task.room && (
              <span className="m-a-room">
                {ROOM_EMOJI[task.room]}
                <span>{t.room[task.room]}</span>
              </span>
            )}
          </span>
          <span className={late ? 'm-a-badge late' : 'm-a-badge info'}>
            <Mi
              name={GLYPH[task.kind]}
              size={10}
              color={late ? undefined : INFO_COLOR[task.kind]}
            />
            {t.kind[task.kind]}
          </span>
        </span>
        <span className="m-a-tick">
          <Mi name="radio-button-unchecked" size={28} />
        </span>
      </div>
    </li>
  )
}

const rows = (tasks: readonly Task[], late: boolean, live: boolean) =>
  Array.map(tasks, (task) => (
    <TaskRow
      key={`${task.plant}-${task.kind}`}
      task={task}
      late={late}
      live={live}
    />
  ))

export function CareScreen({ shot, on = true }: ScreenProps) {
  const ref = useRef<HTMLElement>(null)
  const { m } = useI18n()
  const t = m.Phone.care
  useLive(ref, load, m.Phone)
  return (
    <section
      ref={ref}
      className={screenClass('care', on)}
      data-shot={shot}
      data-scr="care"
      aria-label={t.aria}
    >
      <div className="m-a-cr-hd">
        <div>
          <b className="m-a-h1">{t.title}</b>
          <p className="m-a-date">{t.date}</p>
        </div>
        <button
          type="button"
          className="m-a-skip"
          role="switch"
          aria-checked="false"
        >
          <span>{t.skip}</span>
          <i />
        </button>
      </div>
      <div className="m-a-cr-body">
        <div className="m-a-sec" data-sec="overdue">
          <b className="m-a-sh">{t.overdue}</b>
          <span className="m-a-count" data-count="">
            {OVERDUE.length}
          </span>
        </div>
        <ul className="m-a-tasks" data-list="overdue">
          {rows(OVERDUE, true, true)}
        </ul>
        <div className="m-a-sec m-a-gap">
          <b className="m-a-sh">{t.today}</b>
        </div>
        <ul className="m-a-tasks m-a-mt3" data-list="today">
          {rows(TODAY, false, true)}
        </ul>
        <div className="m-a-sec m-a-gap">
          <b className="m-a-sh">{t.upcoming}</b>
        </div>
        <p className="m-a-day">{t.friday}</p>
        <ul className="m-a-tasks">{rows(UPCOMING, false, false)}</ul>
      </div>
      <nav className="m-a-tabs" aria-hidden="true">
        <span>
          <Mi name="home" size={26} />
          {t.tabs.home}
        </span>
        <span>
          <Mi name="local-florist" size={26} />
          {t.tabs.plants}
        </span>
        <span className="on">
          <Mi name="water-drop" size={26} />
          <i className="dot" />
          {t.tabs.care}
        </span>
        <span>
          <Mi name="person" size={26} />
          {t.tabs.profile}
        </span>
      </nav>
      <Toast />
    </section>
  )
}
