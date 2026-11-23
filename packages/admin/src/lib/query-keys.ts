import type { AnalyticsRangePreset } from '@/hooks/analytics/use-analytics-filters'

type AnalyticsMetric =
  | 'active-subscribers-by-tier'
  | 'dau-wau-mau'
  | 'diagnosis-resolution-rate'
  | 'mrr-estimate'
  | 'paid-churn'
  | 'paywall-attribution'
  | 'plants-per-user'
  | 'signup-to-first-plant'
  | 'trial-to-paid'
  | 'users-by-status'

type RangedAnalyticsMetric =
  | 'ai-chat-volume'
  | 'care-log-volume'
  | 'dead-letter-volume'
  | 'notification-to-care-action'

export const queryKeys = {
  analytics: {
    metric: (metric: AnalyticsMetric) => ['analytics', metric] as const,
    ranged: (metric: RangedAnalyticsMetric, preset: AnalyticsRangePreset) =>
      ['analytics', metric, preset] as const,
  },

  users: {
    search: (search: string) => ['admin-users', search] as const,
    list: (
      page: number,
      limit: number,
      search: string,
      role: string,
      status: string
    ) => ['admin-users-list', page, limit, search, role, status] as const,
    overview: (id: string) => ['admin-user-overview', id] as const,
    plants: (id: string, page: number) =>
      ['admin-user-plants', id, page] as const,
    conversations: (id: string, page: number) =>
      ['admin-user-conversations', id, page] as const,
    conversationMessages: (
      userId: string,
      conversationId: string | null,
      page: number
    ) => ['admin-conversation-messages', userId, conversationId, page] as const,
  },

  giftCodes: {
    all: ['gift-codes'] as const,
    page: (page: number) => [...queryKeys.giftCodes.all, page] as const,
    detail: (id: string) => [...queryKeys.giftCodes.all, id] as const,
  },

  giftHistory: {
    all: ['gift-history'] as const,
    page: (page: number) => [...queryKeys.giftHistory.all, page] as const,
  },

  ingestJobs: ['ingest-jobs'] as const,
  knowledgeStats: ['knowledge-stats'] as const,
} as const
