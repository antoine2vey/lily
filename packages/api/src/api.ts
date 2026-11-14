import { AchievementsApi } from '@lily/api/services/achievements/api'
import { ActivityPushTokensApi } from '@lily/api/services/activity-push-tokens/api'
import { AdminApi } from '@lily/api/services/admin/api'
import { AdminAnalyticsApi } from '@lily/api/services/admin-analytics/api'
import { AIChatApi } from '@lily/api/services/ai-chat/api'
import { AuthApi } from '@lily/api/services/auth/api'
import { CanopyApi, CanopyInvitesApi } from '@lily/api/services/canopy/api'
import { CareLogsApi } from '@lily/api/services/care-logs/api'
import { CarePlansApi } from '@lily/api/services/care-plans/api'
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
import { VacationApi } from '@lily/api/services/vacation/api'
import { WeatherApi } from '@lily/api/services/weather/api'
import { API_PREFIX } from '@lily/shared'
import { HttpApi } from 'effect/http-api'

export const Api = HttpApi.make('Api')
  .add(HealthApiGroup)
  .add(AuthApi.prefix(API_PREFIX))
  .add(UsernameApi.prefix(API_PREFIX))
  .add(UsersApi.prefix(API_PREFIX))
  .add(AdminApi.prefix(API_PREFIX))
  .add(AdminAnalyticsApi.prefix(API_PREFIX))
  .add(PlantsApi.prefix(API_PREFIX))
  .add(PlantCatalogApi.prefix(API_PREFIX))
  .add(RoomsApi.prefix(API_PREFIX))
  .add(CareLogsApi.prefix(API_PREFIX))
  .add(CareTasksApi.prefix(API_PREFIX))
  .add(CarePlansApi.prefix(API_PREFIX))
  .add(NotificationsApi.prefix(API_PREFIX))
  .add(DeviceTokensApi.prefix(API_PREFIX))
  .add(ActivityPushTokensApi.prefix(API_PREFIX))
  .add(AIChatApi.prefix(API_PREFIX))
  .add(DiagnosisApi.prefix(API_PREFIX))
  .add(AchievementsApi.prefix(API_PREFIX))
  .add(SubscriptionsApi.prefix(API_PREFIX))
  .add(SubscriptionWebhooksApi.prefix(API_PREFIX))
  .add(SocialApi.prefix(API_PREFIX))
  .add(DelegationApi.prefix(API_PREFIX))
  .add(CanopyApi.prefix(API_PREFIX))
  .add(CanopyInvitesApi.prefix(API_PREFIX))
  .add(VacationApi.prefix(API_PREFIX))
  .add(WeatherApi.prefix(API_PREFIX))
  .add(KnowledgeIngestionApi.prefix(API_PREFIX))
  .add(InternalApi)
  .add(KnowledgeApi.prefix(API_PREFIX))

export type Api = typeof Api
