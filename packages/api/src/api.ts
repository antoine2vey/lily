import { HttpApi } from '@effect/platform'
import { AchievementsApi } from '@lily/api/services/achievements/api'
import { ActivityPushTokensApi } from '@lily/api/services/activity-push-tokens/api'
import { AdminApi } from '@lily/api/services/admin/api'
import { AdminAnalyticsApi } from '@lily/api/services/admin-analytics/api'
import { AIChatApi } from '@lily/api/services/ai-chat/api'
import { AuthApi } from '@lily/api/services/auth/api'
import { CareLogsApi } from '@lily/api/services/care-logs/api'
import { CareTasksApi } from '@lily/api/services/care-tasks/api'
import { DelegationApi } from '@lily/api/services/delegation/api'
import { DeviceTokensApi } from '@lily/api/services/device-tokens/api'
import { DiagnosisApi } from '@lily/api/services/diagnosis/api'
import { HealthApiGroup } from '@lily/api/services/health/api'
import { InternalApi } from '@lily/api/services/internal/api'
import { KnowledgeApi } from '@lily/api/services/knowledge/api'
import { KnowledgeIngestionApi } from '@lily/api/services/knowledge-ingestion/api'
import { NotificationsApi } from '@lily/api/services/notifications/api'
import { PlantCatalogApi } from '@lily/api/services/plant-catalog/api'
import { PlantsApi } from '@lily/api/services/plants/api'
import { RoomsApi } from '@lily/api/services/rooms/api'
import { SocialApi } from '@lily/api/services/social/api'
import {
  SubscriptionsApi,
  SubscriptionWebhooksApi,
} from '@lily/api/services/subscriptions/api'
import { UsersApi } from '@lily/api/services/user/api'
import { UsernameApi } from '@lily/api/services/username/api'
import { WeatherApi } from '@lily/api/services/weather/api'

// Create API that includes all services
// Health endpoint is at root level (/health)
// All other endpoints are prefixed with /api
export const Api = HttpApi.make('Api')
  .add(HealthApiGroup)
  .add(AuthApi.prefix('/api'))
  .add(UsernameApi.prefix('/api'))
  .add(UsersApi.prefix('/api'))
  .add(AdminApi.prefix('/api'))
  .add(AdminAnalyticsApi.prefix('/api'))
  .add(PlantsApi.prefix('/api'))
  .add(PlantCatalogApi.prefix('/api'))
  .add(RoomsApi.prefix('/api'))
  .add(CareLogsApi.prefix('/api'))
  .add(CareTasksApi.prefix('/api'))
  .add(NotificationsApi.prefix('/api'))
  .add(DeviceTokensApi.prefix('/api'))
  .add(ActivityPushTokensApi.prefix('/api'))
  .add(AIChatApi.prefix('/api'))
  .add(DiagnosisApi.prefix('/api'))
  .add(AchievementsApi.prefix('/api'))
  .add(SubscriptionsApi.prefix('/api'))
  .add(SubscriptionWebhooksApi.prefix('/api'))
  .add(SocialApi.prefix('/api'))
  .add(DelegationApi.prefix('/api'))
  .add(WeatherApi.prefix('/api'))
  .add(KnowledgeIngestionApi.prefix('/api'))
  .add(InternalApi)
  .add(KnowledgeApi.prefix('/api'))

export type Api = typeof Api
