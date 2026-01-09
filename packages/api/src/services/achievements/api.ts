import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware'
import { Achievement, UnlockAchievementRequest } from '@lily/shared/achievement'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Schema } from 'effect'

// Path parameter for user ID
const userIdParam = HttpApiSchema.param('userId', Schema.String)

// Define the Achievements API group - nested under users
export const AchievementsApi = HttpApiGroup.make('achievements')
  .add(
    // GET /users/:userId/achievements - List user's unlocked achievements
    HttpApiEndpoint.get(
      'getUserAchievements'
    )`/users/${userIdParam}/achievements`
      .addSuccess(Schema.Array(Achievement))
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /users/:userId/achievements/unlock - Manually unlock achievement (admin/testing)
    HttpApiEndpoint.post(
      'unlockAchievement'
    )`/users/${userIdParam}/achievements/unlock`
      .setPayload(UnlockAchievementRequest)
      .addSuccess(Achievement, { status: 201 })
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .middleware(Authentication)
