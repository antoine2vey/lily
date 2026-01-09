import { HttpApi } from '@effect/platform'
import { AchievementsApi } from '@lily/api/services/achievements/api'
import { AdminApi } from '@lily/api/services/admin/api'
import { AIChatApi } from '@lily/api/services/ai-chat/api'
import { AuthApi } from '@lily/api/services/auth/api'
import { CareLogsApi } from '@lily/api/services/care-logs/api'
import { DeviceTokensApi } from '@lily/api/services/device-tokens/api'
import { NotificationsApi } from '@lily/api/services/notifications/api'
import { PlantsApi } from '@lily/api/services/plants/api'
import { UsersApi } from '@lily/api/services/user/api'
import { UsernameApi } from '@lily/api/services/username/api'

// Create API that includes all services
export const Api = HttpApi.make('Api')
  .add(AuthApi)
  .add(UsernameApi)
  .add(UsersApi)
  .add(AdminApi)
  .add(PlantsApi)
  .add(CareLogsApi)
  .add(NotificationsApi)
  .add(DeviceTokensApi)
  .add(AIChatApi)
  .add(AchievementsApi)
  .prefix('/api')

export type Api = typeof Api
