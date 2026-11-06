import { Array } from 'effect'
import { useI18n } from '@/i18n'

const pad = (n: number) => String(n).padStart(2, '0')

export function Faq() {
  const { m } = useI18n()
  const t = m.Faq
  return (
    <section className="m-faq m-cv" id="faq">
      <div className="m-wrap">
        <div data-rv>
          <p className="m-kicker">{t.kicker}</p>
          <h2 className="m-h2">{t.title}</h2>
        </div>
        <div className="m-faq-list">
          {Array.map(t.items, (item, i) => (
            <details key={item.q}>
              <summary>
                <span className="n">{pad(i + 1)}</span>
                <span>{item.q}</span>
                <span className="x" aria-hidden="true">
                  <svg aria-hidden="true">
                    <use href="#m-plus" />
                  </svg>
                </span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
