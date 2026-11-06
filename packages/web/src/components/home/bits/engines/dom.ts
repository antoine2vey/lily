import { defaultLocale, isLocale, type Locale } from '@/i18n'

export const q = <E extends Element = HTMLElement>(
  root: ParentNode,
  sel: string
): E => {
  const el = root.querySelector<E>(sel)
  if (!el) throw new Error(`bits: missing ${sel}`)
  return el
}

// Engines get their namespace, not the locale. The plural rules follow the
// document's lang, which the root route sets from the route param.
export const pageLocale = (): Locale => {
  const lang = document.documentElement.lang
  return isLocale(lang) ? lang : defaultLocale
}
