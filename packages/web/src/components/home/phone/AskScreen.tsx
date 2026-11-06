import { Array } from 'effect'
import { useRef } from 'react'
import { useI18n } from '@/i18n'
import { useLive } from '../live'
import { Mi, type ScreenProps, screenClass } from './ui'

const load = () => import('./engines/ask')

// Author of each message in Phone.ask.messages, in order.
const WHO = ['lily', 'me', 'lily'] as const

export function AskScreen({ shot, on = true }: ScreenProps) {
  const ref = useRef<HTMLElement>(null)
  const { m } = useI18n()
  const t = m.Phone.ask
  useLive(ref, load, m.Phone)
  return (
    <section
      ref={ref}
      className={screenClass('ask', on)}
      data-shot={shot}
      data-scr="ask"
      aria-label={t.aria}
    >
      <div className="m-a-ch-hd">
        <span className="m-a-glassbtn">
          <Mi name="arrow-back" size={22} />
        </span>
        <span className="m-a-av md">{t.lilyAv}</span>
        <span className="m-a-ch-who">
          <b>{t.assistant}</b>
          <span>
            <i />
            {t.online}
          </span>
        </span>
        <span className="m-a-glassbtn">
          <Mi name="menu" size={22} />
        </span>
      </div>
      <div className="m-a-msgs" data-msgs="">
        {Array.map(Array.zip(WHO, t.messages), ([who, msg]) =>
          who === 'me' ? (
            <div key={`${who}-${msg.time}`} className="m-a-msg me">
              <div>
                <p className="m-a-bub">{msg.text}</p>
                <time>{msg.time}</time>
              </div>
              <span className="m-a-av">{t.meAv}</span>
            </div>
          ) : (
            <div key={`${who}-${msg.time}`} className="m-a-msg lily">
              <span className="m-a-av">{t.lilyAv}</span>
              <div>
                <p className="m-a-bub">{msg.text}</p>
                <time>{msg.time}</time>
              </div>
            </div>
          )
        )}
      </div>
      <div className="m-a-in">
        <div className="m-a-in-chips">
          <span>
            <Mi name="photo" size={18} />
            {t.gallery}
          </span>
          <span>
            <Mi name="add-a-photo" size={18} />
            {t.photo}
          </span>
        </div>
        <div className="m-a-field">
          <button type="button" className="m-a-field-t" data-field="">
            <span className="ph">{t.placeholder}</span>
            <span className="val" data-val="" />
          </button>
          <button
            type="button"
            className="m-a-send"
            data-send=""
            aria-label={t.send}
            disabled
          >
            <Mi name="arrow-upward" size={22} />
          </button>
        </div>
      </div>
    </section>
  )
}
