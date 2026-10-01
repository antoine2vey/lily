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

// Define the Achievements API group - uses CurrentUser from auth middleware
export const AchievementsApi = HttpApiGroup.make('achievements')
  .add(
    // GET /achievements - List all achievements with progress for current user
    HttpApiEndpoint.get('getUserAchievements', '/', {
      success: AchievementsResponse,
      error: [
        UserNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // GET /achievements/events - SSE stream for real-time achievement unlock notifications
    HttpApiEndpoint.get('achievementEvents', '/events')
  )
  .add(
    // POST /achievements/unlock - Manually unlock achievement (admin only)
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
