'use client'

import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { locales } from '@/i18n/routing'

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('Header')
  const locale = useLocale()
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const glassStyle: React.CSSProperties = scrolled
    ? {
        backdropFilter: 'blur(20px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        boxShadow:
          '0 8px 32px var(--glass-drop), inset 0 1px 0 var(--glass-highlight)',
      }
    : { border: '1px solid transparent' }

  return (
    <header
      className={`fixed z-50 bg-background transition-all duration-300 ${scrolled ? 'top-3 left-4 right-4 rounded-2xl' : 'top-0 left-0 right-0'}`}
      style={glassStyle}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href={`/${locale}`} className="flex items-center gap-2">
          <span className="text-2xl">🌿</span>
          <span className="text-xl font-bold text-lily-text">Lily</span>
        </a>

        <div className="flex items-center gap-3">
          <a
            href={`/${locale}/blog`}
            className="hidden sm:inline-block text-muted hover:text-lily-text text-sm font-medium transition-colors"
          >
            {t('blog')}
          </a>

          <div ref={langRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              className="flex items-center gap-1 text-muted hover:text-lily-text text-xs font-semibold uppercase tracking-wider transition-colors shadow-neu-inset-sm px-3 py-1 rounded-full"
            >
              {locale}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
                className={`transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`}
              >
                <path
                  d="M2 3.5L5 6.5L8 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {langOpen && (
              <div className="absolute right-0 top-full mt-2 min-w-[80px] rounded-xl shadow-neu bg-background py-1 z-50">
                {locales.map((l) => (
                  <a
                    key={l}
                    href={pathname.replace(`/${locale}`, `/${l}`)}
                    onClick={() => setLangOpen(false)}
                    className={`block px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-primary ${l === locale ? 'text-primary' : 'text-muted'}`}
                  >
                    {l}
                  </a>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            className="w-10 h-10 rounded-full flex items-center justify-center text-lily-text shadow-neu-sm hover:shadow-neu-inset-sm transition-all duration-200"
          >
            {mounted ? (
              theme === 'dark' ? (
                <SunIcon />
              ) : (
                <MoonIcon />
              )
            ) : (
              <MoonIcon />
            )}
          </button>

          <a
            href={`/${locale}#pricing`}
            className="shadow-neu-sm bg-background text-primary font-semibold px-5 py-2 rounded-full text-sm hover:shadow-neu-inset-sm transition-all duration-200"
          >
            {t('getApp')}
          </a>
        </div>
      </div>
    </header>
  )
}
