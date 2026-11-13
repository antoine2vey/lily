import { type CareEvent, CareTopic } from '@lily/api/contexts/care'
import { type ReplanContext, replan } from '@lily/api/contexts/reminders/replan'
import { RemindersTopic } from '@lily/api/contexts/reminders/request'
import { staleAfterCare } from '@lily/api/contexts/reminders/triggers'
import { EventBus, eventRetryPolicy } from '@lily/api/events'
import {
  type Consumer,
  ConsumerFailed,
  consumer,
} from '@lily/api/kernel/outbox'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { type Context, Effect } from 'effect'

export type RemindersConsumerContext = ReplanContext | EventBus

export const CARE_CONSUMER = 'reminders'
export const REPLAN_CONSUMER = 'reminders-replan'

type Recorded = Extract<CareEvent, { _tag: 'CareRecorded' }>

const acknowledgeCare = ({ plantId, by }: Recorded) =>
  Effect.gen(function* () {
    const notifications = yield* NotificationRepository
    const eventBus = yield* EventBus
    if (
      by !== null &&
      (yield* notifications.hasNotificationToday(by, plantId))
    ) {
      yield* eventBus
        .publish({ _tag: 'ReminderResponded', userId: by, plantId })
        .pipe(Effect.retry(eventRetryPolicy))
    }
  })

const handle = (event: CareEvent) =>
  Effect.andThen(
    event._tag === 'CareRecorded' ? acknowledgeCare(event) : Effect.void,
    Effect.forEach(staleAfterCare(event), replan, { discard: true })
  )

const failed = (name: string) => (error: { readonly _tag: string }) =>
  Effect.fail(ConsumerFailed.because(name, error))

/**
 * Reminders' reaction to Care. Every handler rebuilds from current state, so
 * a redelivered or reordered event converges on the same reminders.
 */
export const remindersConsumer = (
  context: Context.Context<RemindersConsumerContext>
): Consumer =>
  consumer(CARE_CONSUMER, CareTopic, (event) =>
    handle(event).pipe(
      Effect.provide(context),
      Effect.catchTag('SqlError', failed(CARE_CONSUMER)),
      Effect.catchTag('EventBusPublishError', failed(CARE_CONSUMER)),
      Effect.withSpan('Reminders.onCareEvent', {
        attributes: { 'event.tag': event._tag, 'plant.id': event.plantId },
      })
    )
  )

/**
 * Plans what a request named, after the requester's commit and in
 * transactions of its own. A request that fails stays in the outbox and is
 * tried again; a request delivered twice plans nothing the second time.
 */
export const replanConsumer = (
  context: Context.Context<ReplanContext>
): Consumer =>
  consumer(REPLAN_CONSUMER, RemindersTopic, (dirty) =>
    replan(dirty).pipe(
      Effect.asVoid,
      Effect.provide(context),
      Effect.catchTag('SqlError', failed(REPLAN_CONSUMER)),
      Effect.withSpan('Reminders.onRequest', {
        attributes: { 'dirty.tag': dirty._tag },
      })
    )
  )
