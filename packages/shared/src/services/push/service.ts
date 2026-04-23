import type {
  LiveActivityPushMessage,
  PushConfigError,
  PushMessage,
  PushSendError,
  PushTicket,
  PushTokenInvalidatedError,
} from '@lily/shared/services/push/types'
import { Context, type Effect } from 'effect'

// Provider-agnostic push notification interface
export interface IPushService {
  readonly send: (
    message: PushMessage
  ) => Effect.Effect<PushTicket, PushSendError | PushConfigError>

  readonly sendBatch: (
    messages: PushMessage[]
  ) => Effect.Effect<PushTicket[], PushSendError | PushConfigError>

  // iOS Live Activity (16.2+, push-to-start requires 17.2+). Start/Update/End
  // map 1:1 to APNs `apns-push-type: liveactivity` events. Callers match on
  // the `_tag` to decide which token to use; providers no-op / log on unknown
  // platforms.
  readonly sendLiveActivity: (
    message: LiveActivityPushMessage
  ) => Effect.Effect<
    PushTicket,
    PushSendError | PushConfigError | PushTokenInvalidatedError
  >
}

// Context tag for dependency injection
export class PushService extends Context.Tag('PushService')<
  PushService,
  IPushService
>() {}
