import * as Sentry from '@sentry/react-native'
import { Linking } from 'react-native'

/**
 * Open an external URL, swallowing the rejection that fires when the OS has
 * no handler for the scheme (e.g. no mail client, or a deep link that can't
 * resolve). A bare `Linking.openURL(url)` leaves that rejection unhandled,
 * which surfaces in Sentry as "Unable to open URL: …". We log it as a
 * warning instead of letting it crash the promise chain.
 */
export const openExternalUrl = (url: string): void => {
  Linking.openURL(url).catch((err) => {
    Sentry.captureException(err, {
      level: 'warning',
      tags: { source: 'linking' },
      extra: { url },
    })
  })
}
