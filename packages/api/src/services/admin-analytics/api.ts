import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import {
  ActiveSubscribersByTierResponse,
  AiChatVolumeResponse,
  AnalyticsFilters,
  CareLogVolumeByTypeResponse,
  DauWauMauResponse,
  DeadLetterVolumeResponse,
  DiagnosisResolutionRateResponse,
  MrrEstimateResponse,
  NotificationToCareActionResponse,
  PaidChurnResponse,
  PaywallAttributionResponse,
  PlantsPerUserDistributionResponse,
  SignupToFirstPlantResponse,
  TrialToPaidResponse,
  UsersByStatusResponse,
} from '@lily/shared/admin/analytics'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

export const AdminAnalyticsApi = HttpApiGroup.make('admin-analytics')
  .add(
    HttpApiEndpoint.get('usersByStatus', '/users-by-status', {
      success: UsersByStatusResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get(
      'activeSubscribersByTier',
      '/active-subscribers-by-tier',
      {
        success: ActiveSubscribersByTierResponse,
        error: ForbiddenError,
      }
    )
  )
  .add(
    HttpApiEndpoint.get(
      'plantsPerUserDistribution',
      '/plants-per-user-distribution',
      {
        success: PlantsPerUserDistributionResponse,
        error: ForbiddenError,
      }
    )
  )
  .add(
    HttpApiEndpoint.get('careLogVolumeByType', '/care-log-volume-by-type', {
      query: AnalyticsFilters,
      success: CareLogVolumeByTypeResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('deadLetterVolume', '/dead-letter-volume', {
      query: AnalyticsFilters,
      success: DeadLetterVolumeResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('aiChatVolume', '/ai-chat-volume', {
      query: AnalyticsFilters,
      success: AiChatVolumeResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get(
      'diagnosisResolutionRate',
      '/diagnosis-resolution-rate',
      {
        success: DiagnosisResolutionRateResponse,
        error: ForbiddenError,
      }
    )
  )
  .add(
    HttpApiEndpoint.get('paywallAttribution', '/paywall-attribution', {
      success: PaywallAttributionResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('signupToFirstPlant', '/signup-to-first-plant', {
      success: SignupToFirstPlantResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('trialToPaid', '/trial-to-paid', {
      success: TrialToPaidResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get(
      'notificationToCareAction',
      '/notification-to-care-action',
      {
        query: AnalyticsFilters,
        success: NotificationToCareActionResponse,
        error: ForbiddenError,
      }
    )
  )
  .add(
    HttpApiEndpoint.get('mrrEstimate', '/mrr-estimate', {
      success: MrrEstimateResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('dauWauMau', '/dau-wau-mau', {
      success: DauWauMauResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('paidChurn', '/paid-churn', {
      success: PaidChurnResponse,
      error: ForbiddenError,
    })
  )
  .prefix('/admin/analytics')
  .middleware(AdminAuth)
