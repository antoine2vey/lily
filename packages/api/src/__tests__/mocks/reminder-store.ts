import {
  type NotificationTable,
  UNTESTED,
  waiting,
} from '@lily/api/__tests__/mocks/notification-table'
import { ReminderStore } from '@lily/api/contexts/reminders/store/rows'
import { isReminderTopic } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CARE_TOPICS } from '@lily/shared/server'
import { Array, Effect, Layer, pipe } from 'effect'

/**
 * The reminder rows of `table`. The key-share reads are the plain reads of
 * the user and plant repositories the test provides.
 */
export const createMockReminderStore = (
  table: NotificationTable
): Layer.Layer<ReminderStore, never, UserRepository | PlantRepository> =>
  Layer.effect(
    ReminderStore,
    Effect.gen(function* () {
      const users = yield* UserRepository
      const plants = yield* PlantRepository
      const { rows, deliveryClaims, occasionDays } = table
      return ReminderStore.of({
        lockReminderPlants: () => Effect.void,

        findHoldersOfWaitingReminders: (plantIds) =>
          Effect.sync(() =>
            pipe(
              rows,
              Array.filter(
                (n) =>
                  waiting(n) &&
                  n.plantId !== undefined &&
                  Array.contains(plantIds, n.plantId) &&
                  Array.contains(CARE_TOPICS, n.type)
              ),
              Array.map((n) => n.userId),
              Array.dedupe
            )
          ),

        findAccountsForKeyShare: users.findByIds,

        findPlantsForKeyShare: plants.findByIds,

        lockReminders: (query) =>
          Effect.sync(() =>
            Array.flatMap(rows, (n) => {
              const occasionDay = occasionDays.get(n.id) ?? null
              const read =
                waiting(n) ||
                (occasionDay !== null &&
                  Array.contains(query.occasionDays, occasionDay))
              return n.plantId !== undefined &&
                Array.contains(query.plantIds, n.plantId) &&
                isReminderTopic(n.type) &&
                read
                ? [
                    {
                      id: n.id,
                      userId: n.userId,
                      plantId: n.plantId,
                      type: n.type,
                      status: n.status,
                      inFlight: deliveryClaims.has(n.id),
                      retryCount: n.retryCount,
                      scheduledAt: n.scheduledAt,
                      occasionDay,
                    },
                  ]
                : []
            })
          ),

        writeReminders: (writes) =>
          Effect.sync(() => {
            const toKeep = Array.filter(
              rows,
              (n) =>
                !(
                  Array.contains(writes.removeIds, n.id) &&
                  waiting(n) &&
                  !deliveryClaims.has(n.id)
                )
            )
            rows.length = 0
            rows.push(...toKeep)
            if (Array.isReadonlyArrayNonEmpty(writes.retimes)) {
              throw new Error(UNTESTED('a retime'))
            }
            Array.forEach(writes.inserts, (insert) => {
              const standing = rows.some(
                (n) =>
                  n.userId === insert.userId &&
                  n.plantId === insert.plantId &&
                  n.type === insert.type &&
                  occasionDays.get(n.id) === insert.occasionDay
              )
              if (standing) {
                throw new Error(UNTESTED('an insert on a standing row'))
              }
              const id = `notification-${crypto.randomUUID()}`
              occasionDays.set(id, insert.occasionDay)
              rows.push({
                id,
                type: insert.type,
                scheduledAt: insert.scheduledAt,
                isRead: false,
                status: 'pending',
                retryCount: 0,
                userId: insert.userId,
                plantId: insert.plantId,
                createdAt: new Date(),
              })
            })
          }),

        hasOverdueReminderOn: (query) =>
          Effect.sync(() =>
            Array.some(rows, (n) => {
              const occasionDay = occasionDays.get(n.id) ?? null
              return (
                n.userId === query.userId &&
                n.type === 'overdue_reminder' &&
                (occasionDay === null
                  ? n.createdAt >= query.from && n.createdAt < query.until
                  : occasionDay === query.day)
              )
            })
          ),

        findPlantIdsOfWaitingReminders: (userId) =>
          Effect.sync(() =>
            pipe(
              rows,
              Array.filter(
                (n) =>
                  n.userId === userId &&
                  waiting(n) &&
                  Array.contains(CARE_TOPICS, n.type)
              ),
              Array.flatMap((n) =>
                n.plantId === undefined ? [] : [n.plantId]
              ),
              Array.dedupe
            )
          ),
      })
    })
  )
