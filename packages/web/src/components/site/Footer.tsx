import { Link, useLocation } from '@tanstack/react-router'
import { locales, useI18n } from '@/i18n'
import { swapLocale } from './Header'

export function Footer() {
  const { locale, m } = useI18n()
  const { pathname } = useLocation()
  return (
    <footer className="mag m-foot">
      <div className="m-wrap">
        <div className="m-foot-top">
          <div>
            <div className="m-brand">
              <img
                className="lt"
                src="/icons/app-light.webp"
                alt={m.Footer.iconAlt}
                width="48"
                height="48"
                loading="lazy"
                decoding="async"
              />
              <img
                className="dk"
                src="/icons/app-dark.webp"
                alt={m.Footer.iconAlt}
                width="48"
                height="48"
                loading="lazy"
                decoding="async"
              />
              <b>{m.Footer.brand}</b>
            </div>
            <p className="m-brand-tag">{m.Footer.tagline}</p>
          </div>
          <nav className="m-links" aria-label={m.Footer.nav}>
            <Link to="/$locale/blog" params={{ locale }}>
              {m.Footer.blog}
            </Link>
            <Link to="/$locale/about" params={{ locale }}>
              {m.Footer.about}
            </Link>
            <Link to="/$locale/team" params={{ locale }}>
              {m.Footer.team}
            </Link>
            <Link to="/$locale/support" params={{ locale }}>
              {m.Footer.support}
            </Link>
            <Link to="/$locale/privacy" params={{ locale }}>
              {m.Footer.privacy}
            </Link>
            <Link to="/$locale/terms" params={{ locale }}>
              {m.Footer.terms}
            </Link>
          </nav>
        </div>
        <div className="m-foot-bot">
          <nav className="m-lang" aria-label={m.Footer.language}>
            {locales.map((l) => (
              <a
                key={l}
                href={swapLocale(pathname, l)}
                hrefLang={l}
                lang={l}
                aria-current={l === locale ? 'true' : undefined}
              >
                {l.toUpperCase()}
              </a>
            ))}
          </nav>
          <p>{m.Footer.copyright}</p>
        </div>
      </div>
    </footer>
  )
}
