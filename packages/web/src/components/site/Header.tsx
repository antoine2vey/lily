import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { type Locale, locales, useI18n } from '@/i18n'
import { LilyMark, MoonIcon, SunIcon } from './icons'

export const swapLocale = (pathname: string, to: Locale): string =>
  pathname.replace(/^\/(en|fr)(?=\/|$)/, `/${to}`)

function ThemeToggle() {
  const { m } = useI18n()
  const [dark, setDark] = useState(false)
  useEffect(
    () => setDark(document.documentElement.classList.contains('dark')),
    []
  )
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    setDark(next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? m.Header.themeLight : m.Header.themeDark}
      className="grid size-10 place-items-center rounded-full bg-chip text-ink transition-colors hover:bg-line"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

export function Header() {
  const { locale, m } = useI18n()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLink =
    'hidden rounded-full px-4 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-chip hover:text-ink sm:inline-flex'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled
          ? 'bg-bg/80 shadow-[0_1px_0_var(--border)] backdrop-blur-xl'
          : ''
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-3 px-[var(--edge,6vw)]">
        <Link
          to="/$locale"
          params={{ locale }}
          className="flex items-center gap-2"
        >
          <LilyMark size={28} />
          <span className="text-[22px] font-bold tracking-tight text-ink">
            Lily
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link to="/$locale/about" params={{ locale }} className={navLink}>
            {m.Header.about}
          </Link>
          <Link to="/$locale/blog" params={{ locale }} className={navLink}>
            {m.Header.blog}
          </Link>
          <div className="flex rounded-full bg-chip p-1">
            {locales.map((l) => (
              <a
                key={l}
                href={swapLocale(pathname, l)}
                hrefLang={l}
                aria-current={l === locale ? 'true' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${
                  l === locale
                    ? 'bg-surface text-ink shadow-[0_2px_8px_-2px_rgba(0,0,0,.2)]'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {l}
              </a>
            ))}
          </div>
          <ThemeToggle />
          <Link
            to="/$locale"
            params={{ locale }}
            hash="download"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold whitespace-nowrap text-on-primary transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-primary-dark"
          >
            {m.Header.getApp}
          </Link>
        </nav>
      </div>
    </header>
  )
}
