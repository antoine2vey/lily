import { Array } from 'effect'
import { useRef } from 'react'
import { fmt, useI18n } from '@/i18n'
import { useLive } from './live'

const TONE: Record<string, string> = {
  primary: 'var(--primary)',
  water: 'var(--water)',
  coral: 'var(--coral)',
}
const pad = (n: number) => String(n).padStart(2, '0')
const loadQuotes = () => import('./engines/quotes')

export function Proof() {
  const { m } = useI18n()
  const t = m.Proof
  const ref = useRef<HTMLDivElement>(null)
  useLive(ref, loadQuotes, t)
  return (
    <section className="m-proof m-cv" aria-labelledby="m-proof-h">
      <div className="m-wrap">
        <h2 className="m-kicker" id="m-proof-h">
          {t.heading}
        </h2>
        <div className="m-stats" data-rv>
          {Array.map(t.stats, (s) => (
            <div key={s.label}>
              <b>
                {s.value}
                {'star' in s && s.star ? (
                  <svg aria-hidden="true">
                    <use href="#m-star" />
                  </svg>
                ) : null}
              </b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="m-qgrid" ref={ref}>
          <div className="m-qside">
            <svg className="m-qmark" aria-hidden="true">
              <use href="#m-quote" />
            </svg>
          </div>
          <div className="m-quotes" aria-live="polite">
            {Array.map(t.reviews, (r, i) => (
              <figure
                key={r.name}
                className={i === 0 ? 'm-quote is-on' : 'm-quote'}
                aria-hidden={i === 0 ? undefined : 'true'}
              >
                <blockquote>
                  <p>{r.quote}</p>
                </blockquote>
                <footer>
                  <span className="m-av" style={{ background: TONE[r.tone] }}>
                    {r.initial}
                  </span>
                  <b>{r.name}</b>
                  <span>{r.detail}</span>
                </footer>
              </figure>
            ))}
          </div>
          <div className="m-qnav">
            <button type="button" data-prev aria-label={t.prev}>
              <svg aria-hidden="true">
                <use href="#m-arrow-l" />
              </svg>
            </button>
            <button type="button" data-next aria-label={t.next}>
              <svg aria-hidden="true">
                <use href="#m-arrow" />
              </svg>
            </button>
            <output data-count>
              {fmt(t.count, { n: pad(1), total: pad(t.reviews.length) })}
            </output>
            <span className="bar" aria-hidden="true">
              <i data-bar />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
