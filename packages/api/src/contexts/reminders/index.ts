import { audienceOf } from './audience'
import { request } from './request'

export type { AddressedPlant } from './audience'
export { type DriftReport, redriveReminders, repairDrift } from './audit'
export {
  type RemindersConsumerContext,
  remindersConsumer,
  replanConsumer,
} from './consumers'
export type { CapOf } from './domain/overdue'
export {
  type OverdueContext,
  type OverdueOutcome,
  type OverduePass,
  type PlantCaps,
  remindOverdue,
} from './overdue'
export { type ReplanContext, replan, replanPlants } from './replan'
export { Dirty, RECIPIENT_SETTINGS } from './store'

/**
 * What other contexts and delivery may ask of Reminders: `request` a replan
 * of what a change made stale, and read who a plant's reminders are
 * addressed to.
 */
export const Reminders = { request, audienceOf } as const
