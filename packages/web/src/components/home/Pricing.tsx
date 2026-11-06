import { Array } from 'effect'
import { useI18n } from '@/i18n'

export function Pricing() {
  const { m } = useI18n()
  const t = m.Pricing
  return (
    <section className="m-pricing m-cv" id="pricing">
      <div className="m-wrap">
        <div data-rv>
          <p className="m-kicker">{t.kicker}</p>
          <h2 className="m-h2">
            {t.title}
            <br />
            <em>{t.titleEm}</em>
          </h2>
          <p className="m-lede">{t.lede}</p>
        </div>
        <div className="m-plans" data-rv>
          <div className="m-plan">
            <h3>{t.monthly.name}</h3>
            <p className="m-amt">
              <sup>{t.pre}</sup>
              {t.monthly.amount}
              {t.post}
            </p>
            <p className="m-per">{t.monthly.per}</p>
            <p>{t.monthly.note}</p>
          </div>
          <div className="m-plan">
            <h3>
              {t.yearly.name} <em>{t.yearly.save}</em>
            </h3>
            <p className="m-amt yr">
              <sup>{t.pre}</sup>
              {t.yearly.amount}
              {t.post}
            </p>
            <p className="m-per">{t.yearly.per}</p>
            <p>{t.yearly.note}</p>
          </div>
        </div>
        <ul className="m-fine" data-rv>
          {Array.map(t.fine, (f) => (
            <li key={f.text}>
              <i>{f.mark}</i>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
        <a className="m-btn-p" href="#download">
          {t.cta}
          <svg aria-hidden="true">
            <use href="#m-arrow" />
          </svg>
        </a>
      </div>
    </section>
  )
}
