export const WEBSITE_BASE_URL = 'https://withlily.app'

export const LICENSE_URL =
  'https://github.com/antoine2vey/lily/blob/main/LICENSE'

const legalLocale = (locale: string) => (locale.startsWith('fr') ? 'fr' : 'en')

export const termsUrl = (locale: string) =>
  `${WEBSITE_BASE_URL}/${legalLocale(locale)}/terms`

export const privacyUrl = (locale: string) =>
  `${WEBSITE_BASE_URL}/${legalLocale(locale)}/privacy`
