import { Context, type Effect } from 'effect'
import type {
  PushConfigError,
  PushMessage,
  PushSendError,
  PushTicket,
} from './types'

// Provider-agnostic push notification interface
export interface IPushService {
  readonly send: (
    message: PushMessage
  ) => Effect.Effect<PushTicket, PushSendError | PushConfigError>

  readonly sendBatch: (
    messages: PushMessage[]
  ) => Effect.Effect<PushTicket[], PushSendError | PushConfigError>
}

// Context tag for dependency injection
export class PushService extends Context.Tag('PushService')<
  PushService,
  IPushService
>() {}
