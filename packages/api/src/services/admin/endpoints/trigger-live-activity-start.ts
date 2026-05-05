import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { retireStartTokenForDevice } from '@lily/api/services/live-activity/retire-start-token'
import type { AdminLiveActivityTriggerResponse } from '@lily/shared/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { PushService } from '@lily/shared/server'
import { Array, Effect } from 'effect'

type Outcome = AdminLiveActivityTriggerResponse['outcomes'][number]

// Diagnostic: bypass the notification worker and force a fresh
// `LiveActivityStart` per active start token. Returns each token's APNs
// outcome so an operator can immediately tell whether the issue is at the
// server (config, send error) or downstream on the device.
export const triggerLiveActivityStart = (
  userId: string
): Effect.Effect<
  AdminLiveActivityTriggerResponse,
  UserNotFoundError | SqlError,
  | UserRepository
  | ActivityPushTokenRepository
  | DeviceTokenRepository
  | PushService
  | CareLogRepository
  | CareScheduleRepository
> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const activityRepo = yield* ActivityPushTokenRepository
    const pushService = yield* PushService

    const user = yield* userRepo.findById(userId)
    if (!user) return yield* new UserNotFoundError()

    const contentState = yield* buildLiveActivityContentState(userId)
    const startTokens = yield* activityRepo.findStartTokensByUserId(userId)
    const activityId = crypto.randomUUID()

    if (!contentState || Array.isEmptyReadonlyArray(startTokens)) {
      return {
        userId,
        activityId,
        contentStateBuilt: contentState !== null,
        startTokenCount: startTokens.length,
        outcomes: [],
      } satisfies AdminLiveActivityTriggerResponse
    }

    const outcomes = yield* Effect.forEach(
      startTokens,
      (
        tok
      ): Effect.Effect<
        Outcome,
        SqlError,
        ActivityPushTokenRepository | DeviceTokenRepository
      > =>
        pushService
          .sendLiveActivity({
            _tag: 'LiveActivityStart',
            to: tok.token,
            attributes: { userId, activityId },
            contentState,
            alert: {
              title: contentState.title,
              body: contentState.headline,
              sound: 'default',
            },
          })
          .pipe(
            Effect.map(
              (ticket): Outcome => ({
                deviceTokenId: tok.deviceTokenId,
                kind: 'accepted',
                apnsId: ticket.id,
              })
            ),
            Effect.catchTags({
              PushSendError: (e) =>
                Effect.succeed<Outcome>({
                  deviceTokenId: tok.deviceTokenId,
                  kind: 'send-error',
                  reason: e.message,
                }),
              PushConfigError: (e) =>
                Effect.succeed<Outcome>({
                  deviceTokenId: tok.deviceTokenId,
                  kind: 'config-error',
                  reason: e.message,
                }),
              PushTokenInvalidatedError: (e) =>
                retireStartTokenForDevice(tok.deviceTokenId).pipe(
                  Effect.as<Outcome>({
                    deviceTokenId: tok.deviceTokenId,
                    kind: 'token-invalidated',
                    reason: e.reason,
                  })
                ),
            })
          ),
      { concurrency: 'unbounded' }
    )

    yield* Effect.logInfo('[admin] LA trigger-start completed', {
      userId,
      activityId,
      outcomes,
    })

    return {
      userId,
      activityId,
      contentStateBuilt: true,
      startTokenCount: startTokens.length,
      outcomes,
    } satisfies AdminLiveActivityTriggerResponse
  }).pipe(
    Effect.withSpan('AdminService.triggerLiveActivityStart', {
      attributes: { 'user.id': userId },
    })
  )
