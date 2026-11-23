import type { Api } from '@lily/api/api'
import type {
  dataTagErrorSymbol,
  dataTagSymbol,
  UnsetMarker,
} from '@tanstack/react-query'
import type { HttpApiClient } from 'effect/http-api'
import type {
  ApiResult,
  GetCleanSuccessType,
  GetRequestParams,
} from '@/utils/client'

type Client = HttpApiClient.ForApi<typeof Api>

/**
 * The key `useEffectQuery` stores a query under. It carries the type of the
 * cached `ApiResult`, so `getQueryData` and `setQueryData` read and write that
 * type.
 */
export type EffectQueryKey<
  X extends keyof Client,
  Y extends keyof Client[X],
> = readonly [X, Y, GetRequestParams<X, Y>] & {
  [dataTagSymbol]: ApiResult<GetCleanSuccessType<X, Y>>
  [dataTagErrorSymbol]: UnsetMarker
}

export const effectQueryKey = <
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>
): EffectQueryKey<X, Y> =>
  [section, method, params] as const as EffectQueryKey<X, Y>

const endpoint = <S extends keyof Client, M extends keyof Client[S] & string>(
  section: S,
  method: M
) => [section, method] as const

export const queryKeys = {
  plants: {
    all: ['plants'] as const,
    lists: () => endpoint('plants', 'getPlants'),
    details: () => endpoint('plants', 'getPlant'),
  },

  careLogs: {
    all: ['careLogs'] as const,
    lists: () => endpoint('careLogs', 'getCareLogs'),
    recentActivities: () => endpoint('careLogs', 'getRecentActivities'),
  },

  careTasks: {
    all: ['careTasks'] as const,
  },

  carePlans: {
    all: ['carePlans'] as const,
    list: () => endpoint('carePlans', 'getCarePlans'),
  },

  subscriptions: {
    all: ['subscriptions'] as const,
    current: () => endpoint('subscriptions', 'getCurrentSubscription'),
  },

  users: {
    all: ['users'] as const,
    settings: () => endpoint('users', 'getUserSettings'),
  },

  notifications: {
    all: ['notifications'] as const,
    lists: () => endpoint('notifications', 'getNotifications'),
    unreadCount: () => endpoint('notifications', 'getUnreadCount'),
  },

  achievements: {
    all: ['achievements'] as const,
  },

  rooms: {
    all: ['rooms'] as const,
    list: () => endpoint('rooms', 'getRooms'),
  },

  auth: {
    all: ['auth'] as const,
  },

  weather: {
    all: ['weather'] as const,
  },

  social: {
    all: ['social'] as const,
    profiles: () => endpoint('social', 'getPublicProfile'),
    suggested: () => endpoint('social', 'getSuggestedUsers'),
    following: () => endpoint('social', 'getFollowing'),
    userFollowers: () => endpoint('social', 'getUserFollowers'),
  },

  vacation: {
    all: ['vacation'] as const,
    state: () => endpoint('vacation', 'getVacation'),
  },

  delegations: {
    all: ['delegations'] as const,
    lists: () => endpoint('delegations', 'getMyDelegations'),
    tasks: () => endpoint('delegations', 'getDelegatedTasks'),
  },

  canopy: {
    all: ['canopy'] as const,
  },

  aiChat: {
    all: ['aiChat'] as const,
    conversations: () => endpoint('aiChat', 'listConversations'),
    conversationMessages: () => endpoint('aiChat', 'getConversationMessages'),
    starters: () => endpoint('aiChat', 'listChatStarters'),
    suggestions: () => endpoint('aiChat', 'listChatSuggestions'),
    followUps: () => endpoint('aiChat', 'listChatFollowUps'),
  },
} as const

// Exact keys of the queries an optimistic update writes. Each hook builds its
// query from the same params.

export const USER_SETTINGS_PARAMS = {}

export const USER_SETTINGS_QUERY_KEY = effectQueryKey(
  'users',
  'getUserSettings',
  USER_SETTINGS_PARAMS
)

export const MY_CANOPY_PARAMS = {}

export const MY_CANOPY_QUERY_KEY = effectQueryKey(
  'canopy',
  'getMyCanopy',
  MY_CANOPY_PARAMS
)

export const notificationsParams = (page: number) =>
  ({
    query: { page: String(page), limit: '20', status: 'sent' },
  }) satisfies GetRequestParams<'notifications', 'getNotifications'>

export const FIRST_NOTIFICATIONS_PAGE_KEY = effectQueryKey(
  'notifications',
  'getNotifications',
  notificationsParams(1)
)
