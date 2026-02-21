import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  Achievement,
  AchievementsResponse,
  UnlockAchievementRequest,
} from '@lily/shared/achievement'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Schema } from 'effect'

// Define the Achievements API group - uses CurrentUser from auth middleware
export const AchievementsApi = HttpApiGroup.make('achievements')
  .add(
    // GET /achievements - List all achievements with progress for current user
    HttpApiEndpoint.get('getUserAchievements')`/`
      .addSuccess(AchievementsResponse)
      .addError(UserNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /achievements/events - SSE stream for real-time achievement unlock notifications
    HttpApiEndpoint.get('achievementEvents')`/events`
  )
  .add(
    // POST /achievements/unlock - Manually unlock achievement (admin only)
    HttpApiEndpoint.post('unlockAchievement')`/unlock`
      .setPayload(UnlockAchievementRequest)
      .addSuccess(Achievement, { status: 201 })
      .addError(ForbiddenError, { status: 403 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/achievements')
  .middleware(Authentication)
