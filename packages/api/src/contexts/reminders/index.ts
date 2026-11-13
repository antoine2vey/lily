import { type CareEvent, CareTopic } from '@lily/api/contexts/care'
import { EventBus, eventRetryPolicy } from '@lily/api/events'
import {
  type Consumer,
  ConsumerFailed,
  consumer,
} from '@lily/api/kernel/outbox'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  type ReminderContext,
  reconcileCareReminder,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import { type Context, Effect, Match } from 'effect'

export type RemindersConsumerContext = ReminderContext | EventBus

const NAME = 'reminders'

type Recorded = Extract<CareEvent, { _tag: 'CareRecorded' }>

const acknowledgeCare = ({ plantId, careType, by }: Recorded) =>
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
    yield* notifications
      .deletePendingByPlantsAndType([plantId], 'overdue_reminder')
      .pipe(
        withReminderKeys(reminderKeysFor([plantId], [`${careType}_reminder`]))
      )
  })

const handle = Match.type<CareEvent>().pipe(
  Match.tagsExhaustive({
    CareRecorded: acknowledgeCare,
    ScheduleChanged: ({ plantId, careType }) =>
      reconcileCareReminder(plantId, `${careType}_reminder`),
    CareAmended: () => Effect.void,
    CareRemoved: () => Effect.void,
    PlantLifeChanged: () => Effect.void,
  })
)

const failed = (error: { readonly _tag: string }) =>
  Effect.fail(ConsumerFailed.because(NAME, error))

/**
 * Reminders' reaction to Care. Every handler rebuilds from current state, so
 * a redelivered or reordered event converges on the same reminders.
 */
export const remindersConsumer = (
  context: Context.Context<RemindersConsumerContext>
): Consumer =>
  consumer(NAME, CareTopic, (event) =>
    handle(event).pipe(
      Effect.provide(context),
      Effect.catchTag('SqlError', failed),
      Effect.catchTag('EventBusPublishError', failed),
      Effect.withSpan('Reminders.onCareEvent', {
        attributes: { 'event.tag': event._tag, 'plant.id': event.plantId },
      })
    )
  )
