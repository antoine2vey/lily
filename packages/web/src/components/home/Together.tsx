import { Array } from 'effect'
import { useI18n } from '@/i18n'

const TONE: Record<string, string> = {
  primary: 'var(--primary)',
  water: 'var(--water)',
  coral: 'var(--coral)',
}

export function Together() {
  const { m } = useI18n()
  const t = m.Together
  const sam = t.canopy.members[1]
  return (
    <section className="m-together m-cv" id="together">
      <div className="m-wrap">
        <div data-rv>
          <p className="m-kicker">{t.kicker}</p>
          <h2 className="m-h2">
            {t.title}
            <br />
            <em>{t.titleEm}</em>
          </h2>
        </div>

        <div className="m-canopy">
          <div data-rv>
            <h3 className="m-h3">{t.canopy.title}</h3>
            <p className="m-lede">{t.canopy.lede}</p>
            <dl className="m-facts">
              {Array.map(t.canopy.facts, (f) => (
                <div key={f.dt}>
                  <dt>{f.dt}</dt>
                  <dd>{f.dd}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="m-invite" data-rv>
            <img
              className="mascot"
              src="/mascot/send-envelope.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              width="170"
              height="170"
            />
            <p className="k">{t.canopy.inviteKicker}</p>
            <h4>{t.canopy.inviteName}</h4>
            <div className="m-link">
              <span>{t.canopy.link}</span>
              <b>{t.canopy.copy}</b>
            </div>
            <ul className="m-members">
              {Array.map(t.canopy.members, (p) => (
                <li key={p.name}>
                  <span className="m-av" style={{ background: TONE[p.tone] }}>
                    {p.initial}
                  </span>
                  <div>
                    <b>{p.name}</b>
                    <span>{p.meta}</span>
                  </div>
                  <time>{p.time}</time>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="m-away">
          <div className="m-away-head" data-rv>
            <h3 className="m-h3">
              {t.away.title} <em>{t.away.titleEm}</em>
            </h3>
            <p className="m-lede">{t.away.lede}</p>
          </div>
          <ol className="m-tl" data-rv>
            <li>
              <p className="m-day">{t.away.leave.day}</p>
              <h4>{t.away.leave.title}</h4>
              <p>{t.away.leave.body}</p>
              <div className="m-card">
                <div className="m-toggle">
                  <div>
                    <b>{t.away.leave.toggle}</b>
                    <span>{t.away.leave.paused}</span>
                  </div>
                  <span className="m-sw" aria-hidden="true" />
                </div>
                <div className="m-paused" aria-hidden="true">
                  {Array.map(t.away.leave.days, (d, i) => (
                    <i
                      key={d}
                      className={i === 1 || i === 2 ? 'off' : undefined}
                    >
                      {d}
                    </i>
                  ))}
                </div>
              </div>
            </li>
            <li>
              <p className="m-day">{t.away.waters.day}</p>
              <h4>{t.away.waters.title}</h4>
              <p>{t.away.waters.body}</p>
              <div className="m-card">
                <div className="m-done">
                  <span className="m-av" style={{ background: TONE[sam.tone] }}>
                    {sam.initial}
                  </span>
                  <div>
                    <b>{t.away.waters.done}</b>
                    <span>{t.away.waters.plants}</span>
                  </div>
                </div>
                <p className="m-quote-note">
                  <b>{t.away.waters.noteLabel}</b> {t.away.waters.note}
                </p>
              </div>
            </li>
            <li>
              <p className="m-day">{t.away.back.day}</p>
              <h4>{t.away.back.title}</h4>
              <p>{t.away.back.body}</p>
              <div className="m-card">
                <ul className="m-shift">
                  {Array.map(t.away.back.shifts, (s) => (
                    <li key={s.task}>
                      <span>{s.task}</span>
                      <span className="d">
                        <s>{s.from}</s>
                        <svg aria-hidden="true">
                          <use href="#m-arrow" />
                        </svg>
                        <em>{s.to}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>
  )
}
