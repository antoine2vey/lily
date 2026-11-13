import { Layer } from 'effect'
import { AbsenceLive as AbsenceServiceLive } from './absence'
import { AbsenceStoreLive } from './store'

export { Absence } from './absence'
export {
  AbsenceEvent,
  AbsenceTopic,
  DelegationEndReason,
} from './domain/events'
export type { Vacation } from './domain/vacation'

export const AbsenceLive = AbsenceServiceLive.pipe(
  Layer.provide(AbsenceStoreLive)
)
