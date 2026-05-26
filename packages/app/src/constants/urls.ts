export const WEBSITE_BASE_URL = 'https://withlily.app'

const legalLocale = (locale: string) => (locale.startsWith('fr') ? 'fr' : 'en')

export const termsUrl = (locale: string) =>
  `${WEBSITE_BASE_URL}/${legalLocale(locale)}/terms`

export const privacyUrl = (locale: string) =>
  `${WEBSITE_BASE_URL}/${legalLocale(locale)}/privacy`
