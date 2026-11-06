import { Array, String } from 'effect'
import { useRef } from 'react'
import { fmt, useI18n } from '@/i18n'
import { useLive } from '../live'
import { Mi, type ScreenProps, screenClass, Toast } from './ui'

const load = () => import('./engines/share')

const initial = (name: string) => String.takeLeft(name, 1)

export function ShareScreen({ shot, on = true }: ScreenProps) {
  const ref = useRef<HTMLElement>(null)
  const { m } = useI18n()
  const t = m.Phone.share
  useLive(ref, load, m.Phone)
  return (
    <section
      ref={ref}
      className={screenClass('share', on)}
      data-shot={shot}
      data-scr="share"
      data-st="canopy"
      aria-label={t.aria}
    >
      <div className="m-a-view m-a-cv">
        <div className="m-a-cn-hd">
          <span className="m-a-glassbtn">
            <Mi name="arrow-back" size={22} />
          </span>
          <b>{t.canopy}</b>
        </div>
        <div className="m-a-cn-body">
          <div className="m-a-cs">
            <p className="m-a-cs-t">
              <b>{t.name}</b>
            </p>
            <div className="m-a-card m-a-cn-name">{t.canopyName}</div>
          </div>
          <div className="m-a-cs">
            <p className="m-a-cs-t">
              <b>{t.members}</b>
              <span>{fmt(t.memberCount, { count: 2, max: 10 })}</span>
            </p>
            <div className="m-a-card">
              <div className="m-a-mem">
                <span className="m-a-av">{initial(t.alex)}</span>
                <b>{t.alex}</b>
                <span className="m-a-bdg n">{t.you}</span>
                <span className="m-a-bdg s">{t.owner}</span>
              </div>
              <div className="m-a-mem">
                <span className="m-a-av">{initial(t.maya)}</span>
                <b>{t.maya}</b>
                <Mi name="person-remove" size={22} />
              </div>
            </div>
          </div>
          <div className="m-a-cs">
            <p className="m-a-cs-t">
              <b>{t.invitePeople}</b>
            </p>
            <div className="m-a-card">
              <div className="m-a-inv">
                <p>{t.inviteNote}</p>
                <button type="button" className="m-a-btn" data-invite="">
                  <Mi name="person-add" size={20} />
                  {t.inviteMember}
                </button>
                <span className="m-a-btn sec">
                  <Mi name="ios-share" size={20} />
                  {t.shareLink}
                </span>
              </div>
              <div className="m-a-pend" data-pend="">
                <p>{t.waiting}</p>
                <div className="m-a-mem">
                  <span className="m-a-av" data-pend-av="">
                    {initial(t.pendingName)}
                  </span>
                  <span className="m-a-pn">
                    <b data-pend-nm="">{t.pendingName}</b>
                    <span data-until="">{t.until}</span>
                  </span>
                  <span className="m-a-wd">{t.withdraw}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="m-a-cs">
            <p className="m-a-cs-t">
              <b>{t.timePlace}</b>
            </p>
            <div className="m-a-card">
              <div className="m-a-row">
                <Mi name="schedule" size={22} />
                <b>{t.timezone}</b>
                <span>{t.timezoneValue}</span>
                <Mi name="chevron-right" size={20} />
              </div>
              <div className="m-a-row">
                <Mi name="place" size={22} />
                <b>{t.location}</b>
                <span>{t.set}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="m-a-view m-a-iv" data-iv="">
        <div className="m-a-iv-hd">
          <button
            type="button"
            className="m-a-glassbtn"
            data-back=""
            aria-label={t.back}
          >
            <Mi name="arrow-back" size={22} />
          </button>
          <b>{t.inviteMember}</b>
          <span />
        </div>
        <div className="m-a-iv-body">
          <div className="m-a-pk">
            <p className="m-a-pk-l">{t.person}</p>
            <div className="m-a-pk-box">
              <button type="button" className="m-a-pk-f" data-pick="">
                <Mi name="search" size={20} />
                <span>{t.search}</span>
              </button>
              <div className="m-a-pk-sel">
                <span className="m-a-av" data-sel-av="">
                  {initial(t.pendingName)}
                </span>
                <b data-sel="">{t.pendingName}</b>
                <button
                  type="button"
                  className="m-a-pk-x"
                  data-clear=""
                  aria-label={t.clear}
                >
                  <Mi name="close" size={18} />
                </button>
              </div>
              <div className="m-a-sugg">
                <p>{t.suggested}</p>
                {Array.map(t.people, (name) => (
                  <button key={name} type="button" data-person={name}>
                    <span className="m-a-av">{initial(name)}</span>
                    <b>{name}</b>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="m-a-iv-d">
            {fmt(t.description, { name: t.canopyName })}
          </p>
          <button type="button" className="m-a-btn" data-send="" disabled>
            {t.send}
          </button>
        </div>
      </div>
      <Toast />
    </section>
  )
}
