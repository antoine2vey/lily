import { Layer } from 'effect'
import { CanopyLive as CanopyServiceLive } from './canopy'
import { CanopyStoreLive } from './store'

export { Canopy, type JoinError, JoinVia } from './canopy'
export type { CanopyChanges } from './domain/decide'
export { CanopyEvent, CanopyTopic, MemberLeftReason } from './domain/events'
export { hashInviteToken, statusAt } from './domain/invitation'

export const CanopyLive = CanopyServiceLive.pipe(Layer.provide(CanopyStoreLive))
