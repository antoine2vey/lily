import { useRef } from 'react'
import { useI18n } from '@/i18n'
import { useLive } from '../live'
import { Mi, type ScreenProps, screenClass } from './ui'

const load = () => import('./engines/scan')

export function ScanScreen({ shot, on = true }: ScreenProps) {
  const ref = useRef<HTMLElement>(null)
  const { m } = useI18n()
  const t = m.Phone.scan
  useLive(ref, load, m.Phone)
  return (
    <section
      ref={ref}
      className={screenClass('scan', on)}
      data-shot={shot}
      data-scr="scan"
      data-st="idle"
      aria-label={t.aria}
    >
      <div className="m-a-feed" role="img" aria-label={t.feedAlt} />
      <div className="m-a-frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="m-a-sc-top">
        <span className="m-a-sc-x">
          <Mi name="close" size={24} />
        </span>
        <span className="m-a-lux">
          <Mi name="wb-cloudy" size={16} color="#F59E0B" />
          <span>{t.lux}</span>
          <span className="dim">{t.luxValue}</span>
        </span>
      </div>
      <div className="m-a-sc-pillwrap" aria-live="polite">
        <div className="m-a-sc-pill">
          <div className="m-a-sc-row">
            <Mi name="search" size={16} className="m-a-find" />
            <Mi name="autorenew" size={16} className="m-a-spin" />
            <span data-say="">{t.detected}</span>
          </div>
          <div className="m-a-res">
            <div className="m-a-res-hd">
              <span className="m-a-res-ph" role="img" aria-label={t.photoAlt} />
              <span className="m-a-res-nm">
                <b>{t.species}</b>
                <span>{t.family}</span>
              </span>
              <span className="m-a-conf">{t.confidence}</span>
            </div>
            <div className="m-a-chips">
              <span>
                <Mi name="water-drop" size={12} color="#60A5FA" />
                {t.water}
              </span>
              <span>
                <Mi name="wb-sunny" size={12} color="#FCD34D" />
                {t.light}
              </span>
            </div>
            <div className="m-a-res-btns">
              <button type="button" className="m-a-add" data-add="">
                {t.add}
              </button>
              <button
                type="button"
                className="m-a-ghost"
                data-reset="again"
                aria-label={t.again}
              >
                <Mi name="refresh" size={20} />
              </button>
              <button
                type="button"
                className="m-a-ghost"
                data-reset="close"
                aria-label={t.close}
              >
                <Mi name="close" size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="m-a-sc-bot">
        <p className="m-a-sc-hint">{t.hint}</p>
        <button type="button" className="m-a-shut" aria-label={t.capture}>
          <i />
        </button>
        <span className="m-a-sc-btn">
          <Mi name="photo-library" size={20} />
          {t.gallery}
        </span>
        <span className="m-a-sc-btn m-a-ar">
          <Mi name="view-in-ar" size={20} />
          {t.ar}
        </span>
        <span className="m-a-sc-man">{t.manual}</span>
      </div>
    </section>
  )
}
