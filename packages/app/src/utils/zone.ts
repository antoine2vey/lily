import {
  DEFAULT_ZONE,
  type ServerZoneName,
  ZoneName,
  zoneOnThisRuntime,
} from '@lily/shared'
import * as Sentry from '@sentry/react-native'
import { Option } from 'effect'

const reported = new Set<ServerZoneName>()

/**
 * A zone from the api, or `DEFAULT_ZONE` when this phone's tzdata predates it
 * (an account zone set from a newer phone), where every date helper throws.
 */
export const zoneOnThisDevice = (zone: ServerZoneName): ZoneName =>
  Option.match(zoneOnThisRuntime(zone), {
    onSome: () => ZoneName.make(zone),
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
