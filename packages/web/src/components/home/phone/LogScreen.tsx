import { Array } from 'effect'
import { useRef } from 'react'
import { useI18n } from '@/i18n'
import { useLive } from '../live'
import { DOT, GLYPH, KINDS, type Kind } from './kinds'
import { Mi, type ScreenProps, screenClass } from './ui'

const load = () => import('./engines/log')

// Kind of each entry in Phone.log.history, in order.
const HISTORY: readonly Kind[] = [
  'watering',
  'watering',
  'watering',
  'fertilization',
  'repotting',
]

export function LogScreen({ shot, on = true }: ScreenProps) {
  const ref = useRef<HTMLElement>(null)
  const { m } = useI18n()
  const t = m.Phone.log
  useLive(ref, load, m.Phone)
  return (
    <section
      ref={ref}
      className={screenClass('log', on)}
      data-shot={shot}
      data-scr="log"
      aria-label={t.aria}
    >
      <div className="m-a-hx-hd">
        <span className="m-a-glassbtn">
          <Mi name="arrow-back" size={22} />
        </span>
        <span className="m-a-hx-t">
          <b>{t.title}</b>
          <span>{t.plant}</span>
        </span>
        <span className="m-a-hx-f">
          <Mi name="tune" size={24} />
        </span>
      </div>
      <div className="m-a-tl" data-tl="">
        {Array.map(Array.zip(HISTORY, t.history), ([kind, h]) => (
          <div key={h.date} className="m-a-grp">
            <b className="m-a-gd">{h.date}</b>
            <div className="m-a-ev">
              <span className="m-a-rail">
                <i />
                <span className={`m-a-dot ${DOT[kind]}`}>
                  <Mi name={GLYPH[kind]} size={20} />
                </span>
                <i />
              </span>
              <div className="m-a-evc">
                <p>
                  <b>{t.logged[kind]}</b>
                  <time>{t.historyTime}</time>
                </p>
                <span>{h.note}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="m-a-fab" data-fab="" aria-label={t.fab}>
        <Mi name="add" size={32} />
      </button>
      <div className="m-a-scrim" data-scrim="" />
      <div
        className="m-a-sheet"
        data-sheet=""
        role="dialog"
        aria-label={t.sheet}
      >
        <span className="m-a-handle" />
        <div className="m-a-sh-hd">
          <b>{t.sheet}</b>
          <button
            type="button"
            className="m-a-sh-x"
            data-close=""
            aria-label={t.close}
          >
            <Mi name="close" size={20} />
          </button>
        </div>
        <div className="m-a-sh-body">
          <p className="m-a-lbl">{t.selectPlant}</p>
          <div className="m-a-pick">
            <span className="m-a-pick-ph" />
            <b>{t.plant}</b>
            <Mi name="expand-more" size={24} />
          </div>
          <p className="m-a-lbl">{t.careType}</p>
          <div className="m-a-types" role="radiogroup" aria-label={t.careType}>
            {Array.map(KINDS, (kind) => (
              // biome-ignore lint/a11y/useSemanticElements: story.css styles B's radio buttons, and a demo screen never submits
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={kind === 'watering' ? 'true' : 'false'}
                data-type={kind}
              >
                <Mi name={GLYPH[kind]} size={20} />
                {t.type[kind]}
              </button>
            ))}
          </div>
          <div className="m-a-lblrow">
            <p className="m-a-lbl">{t.dateTime}</p>
            <span className="m-a-now">{t.now}</span>
          </div>
          <div className="m-a-dt">
            <span>
              <Mi name="calendar-today" size={20} />
              {t.date}
            </span>
            <span>
              <Mi name="schedule" size={20} />
              {t.time}
            </span>
          </div>
          <p className="m-a-lbl">{t.notes}</p>
          <p className="m-a-notes">{t.notesHint}</p>
          <p className="m-a-addph">
            <span>
              <Mi name="add-a-photo" size={24} />
            </span>
            {t.addPhoto}
          </p>
        </div>
        <div className="m-a-sh-foot">
          <button type="button" className="m-a-btn" data-save="">
            <Mi name="check" size={20} />
            {t.save}
          </button>
        </div>
      </div>
    </section>
  )
}
