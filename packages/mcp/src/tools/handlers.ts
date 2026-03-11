import type * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RagService } from '@lily/api/services/rag/service'
import type { OAuthService } from '@lily/mcp/auth/oauth-service'
import { resolveAuthFromRequest } from '@lily/mcp/auth/resolve-user'
import {
  askPlantQuestionEffect,
  carePlantEffect,
  getCareTasksEffect,
  getOverduePlantsEffect,
  getPlantDetailsEffect,
  listPlantsEffect,
  waterPlantEffect,
} from '@lily/mcp/tools'
import { PlantToolkit } from '@lily/mcp/tools/definitions'
import type { EventBus } from '@lily/shared/server'
import { Effect } from 'effect'

/**
 * Global services that tool effects need, provided at layer construction time.
 * OAuthService + UserRepository are included for resolveAuthFromRequest.
 */
type ToolDeps =
  | PlantRepository
  | UserRepository
  | CareLogRepository
  | CareScheduleRepository
  | NotificationRepository
  | RagService
  | EventBus
  | PgDrizzle.PgDrizzle
  | OAuthService

/**
 * Wires the PlantToolkit to the existing tool effect functions.
 *
 * Global services (repos, OAuthService, etc.) are captured from the layer
 * context at construction time. For tools requiring authentication,
 * CurrentUser is resolved per-request from the bearer token via
 * resolveAuthFromRequest. Unauthenticated tools only need the global context.
 */
export const PlantToolkitHandlersLive = PlantToolkit.toLayer(
  Effect.gen(function* () {
    const ctx = yield* Effect.context<ToolDeps>()

    const withAuth = <A>(toolEffect: Effect.Effect<A, unknown, unknown>) =>
      resolveAuthFromRequest.pipe(
        Effect.flatMap((user) =>
          toolEffect.pipe(Effect.provideService(CurrentUser, user))
        ),
        Effect.provide(ctx),
        Effect.orDie
      ) as Effect.Effect<A, never>

    return {
      list_plants: (params) => withAuth(listPlantsEffect(params)),
      get_plant_details: (params) => withAuth(getPlantDetailsEffect(params)),
      get_care_tasks: () => withAuth(getCareTasksEffect()),
      get_overdue_plants: () => withAuth(getOverduePlantsEffect()),
      ask_plant_question: (params) =>
        askPlantQuestionEffect(params).pipe(Effect.provide(ctx), Effect.orDie),
      water_plant: (params) => withAuth(waterPlantEffect(params)),
      care_plant: (params) => withAuth(carePlantEffect(params)),
    }
  })
)
