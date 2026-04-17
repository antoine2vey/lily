import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { activeSubscribersByTier } from '@lily/api/services/admin-analytics/endpoints/active-subscribers-by-tier'
import { aiChatVolume } from '@lily/api/services/admin-analytics/endpoints/ai-chat-volume'
import { careLogVolumeByType } from '@lily/api/services/admin-analytics/endpoints/care-log-volume-by-type'
import { dauWauMau } from '@lily/api/services/admin-analytics/endpoints/dau-wau-mau'
import { deadLetterVolume } from '@lily/api/services/admin-analytics/endpoints/dead-letter-volume'
import { diagnosisResolutionRate } from '@lily/api/services/admin-analytics/endpoints/diagnosis-resolution-rate'
import { mrrEstimate } from '@lily/api/services/admin-analytics/endpoints/mrr-estimate'
import { notificationToCareAction } from '@lily/api/services/admin-analytics/endpoints/notification-to-care-action'
import { paidChurn } from '@lily/api/services/admin-analytics/endpoints/paid-churn'
import { paywallAttribution } from '@lily/api/services/admin-analytics/endpoints/paywall-attribution'
import { plantsPerUserDistribution } from '@lily/api/services/admin-analytics/endpoints/plants-per-user-distribution'
import { signupToFirstPlant } from '@lily/api/services/admin-analytics/endpoints/signup-to-first-plant'
import { trialToPaid } from '@lily/api/services/admin-analytics/endpoints/trial-to-paid'
import { usersByStatus } from '@lily/api/services/admin-analytics/endpoints/users-by-status'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'

export const AdminAnalyticsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'admin-analytics', (handlers) =>
    handlers
      .handle('usersByStatus', () =>
        usersByStatus().pipe(withInfraErrorsAsDefect)
      )
      .handle('activeSubscribersByTier', () =>
        activeSubscribersByTier().pipe(withInfraErrorsAsDefect)
      )
      .handle('plantsPerUserDistribution', () =>
        plantsPerUserDistribution().pipe(withInfraErrorsAsDefect)
      )
      .handle('careLogVolumeByType', ({ urlParams }) =>
        careLogVolumeByType(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('deadLetterVolume', ({ urlParams }) =>
        deadLetterVolume(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('aiChatVolume', ({ urlParams }) =>
        aiChatVolume(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('diagnosisResolutionRate', () =>
        diagnosisResolutionRate().pipe(withInfraErrorsAsDefect)
      )
      .handle('paywallAttribution', () =>
        paywallAttribution().pipe(withInfraErrorsAsDefect)
      )
      .handle('signupToFirstPlant', () =>
        signupToFirstPlant().pipe(withInfraErrorsAsDefect)
      )
      .handle('trialToPaid', () => trialToPaid().pipe(withInfraErrorsAsDefect))
      .handle('notificationToCareAction', ({ urlParams }) =>
        notificationToCareAction(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('mrrEstimate', () => mrrEstimate().pipe(withInfraErrorsAsDefect))
      .handle('dauWauMau', () => dauWauMau().pipe(withInfraErrorsAsDefect))
      .handle('paidChurn', () => paidChurn().pipe(withInfraErrorsAsDefect))
  )
