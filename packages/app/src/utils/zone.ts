import { DEFAULT_ZONE, type ZoneName, zoneOnThisRuntime } from '@lily/shared'
import * as Sentry from '@sentry/react-native'
import { Option } from 'effect'

const reported = new Set<ZoneName>()

/**
 * A zone from the api, or `DEFAULT_ZONE` when this phone's tzdata predates it
 * (an account zone set from a newer phone). Every date helper throws on such a
 * zone, so a zone the api sends goes through here before one sees it.
 */
export const zoneOnThisDevice = (zone: ZoneName): ZoneName =>
  Option.match(zoneOnThisRuntime(zone), {
    onSome: () => zone,
    onNone: () => {
      if (!reported.has(zone)) {
        reported.add(zone)
        Sentry.captureMessage('zone.unknown_on_device', {
          level: 'warning',
          tags: { zone },
        })
      }
      return DEFAULT_ZONE
    },
  })
