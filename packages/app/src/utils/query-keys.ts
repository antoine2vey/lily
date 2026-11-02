import type { Api } from '@lily/api/api'
import type { HttpApiClient } from 'effect/http-api'

type Client = HttpApiClient.ForApi<typeof Api>

const endpoint = <S extends keyof Client, M extends keyof Client[S] & string>(
  section: S,
  method: M
) => [section, method] as const

export const queryKeys = {
  // Plants domain
  plants: {
    all: ['plants'] as const,
    lists: () => endpoint('plants', 'getPlants'),
    details: () => endpoint('plants', 'getPlant'),
  },

  // Care logs domain
  careLogs: {
    all: ['careLogs'] as const,
    lists: () => endpoint('careLogs', 'getCareLogs'),
    recentActivities: () => endpoint('careLogs', 'getRecentActivities'),
  },

  // Care tasks domain
  careTasks: {
    all: ['careTasks'] as const,
  },

  // Care plans domain (AI-proposed checklists)
  carePlans: {
    all: ['carePlans'] as const,
    list: () => endpoint('carePlans', 'getCarePlans'),
  },

  // Subscriptions domain
  subscriptions: {
    all: ['subscriptions'] as const,
    current: () => endpoint('subscriptions', 'getCurrentSubscription'),
  },

  // Users domain
  users: {
    all: ['users'] as const,
    settings: () => endpoint('users', 'getUserSettings'),
  },

  // Notifications domain
  notifications: {
    all: ['notifications'] as const,
    lists: () => endpoint('notifications', 'getNotifications'),
    unreadCount: () => endpoint('notifications', 'getUnreadCount'),
  },

  // Achievements domain
  achievements: {
    all: ['achievements'] as const,
  },

  // Rooms domain
  rooms: {
    all: ['rooms'] as const,
    list: () => endpoint('rooms', 'getRooms'),
  },

  // Auth domain
  auth: {
    all: ['auth'] as const,
  },

  // Weather domain
  weather: {
    all: ['weather'] as const,
  },

  // Social domain
  social: {
    all: ['social'] as const,
    profiles: () => endpoint('social', 'getPublicProfile'),
    suggested: () => endpoint('social', 'getSuggestedUsers'),
  },

  // Vacation domain
  vacation: {
    all: ['vacation'] as const,
    state: () => endpoint('vacation', 'getVacation'),
  },

  // Delegations domain
  delegations: {
    all: ['delegations'] as const,
    lists: () => endpoint('delegations', 'getMyDelegations'),
    tasks: () => endpoint('delegations', 'getDelegatedTasks'),
  },

  canopy: {
    all: ['canopy'] as const,
    mine: () => [...queryKeys.canopy.all, 'getMyCanopy', {}] as const,
  },
} as const

/**
 * Helper to invalidate all queries for a domain
 */
export const invalidateKeys = {
  plants: queryKeys.plants.all,
  careLogs: queryKeys.careLogs.all,
  careTasks: queryKeys.careTasks.all,
  carePlans: queryKeys.carePlans.all,
  subscriptions: queryKeys.subscriptions.all,
  users: queryKeys.users.all,
  notifications: queryKeys.notifications.all,
  rooms: queryKeys.rooms.all,
  achievements: queryKeys.achievements.all,
  auth: queryKeys.auth.all,
  weather: queryKeys.weather.all,
  social: queryKeys.social.all,
  vacation: queryKeys.vacation.all,
  delegations: queryKeys.delegations.all,
  canopy: queryKeys.canopy.all,
} as const
