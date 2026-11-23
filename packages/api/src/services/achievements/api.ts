import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  Achievement,
  AchievementsResponse,
  UnlockAchievementRequest,
} from '@lily/shared/achievement'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

export const AchievementsApi = HttpApiGroup.make('achievements')
  .add(
    HttpApiEndpoint.get('getUserAchievements', '/', {
      success: AchievementsResponse,
      error: [
        UserNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(HttpApiEndpoint.get('achievementEvents', '/events'))
  .add(
    HttpApiEndpoint.post('unlockAchievement', '/unlock', {
      payload: UnlockAchievementRequest,
      success: Achievement.pipe(HttpApiSchema.status(201)),
      error: [
        ForbiddenError,
        UserNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/achievements')
  .middleware(Authentication)
