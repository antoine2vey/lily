/**
 * Centralized query key factory for React Query.
 * Provides type-safe, consistent query keys for all API endpoints.
 *
 * Usage:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
 *   queryClient.invalidateQueries({ queryKey: queryKeys.plants.detail(id) })
 */

export const queryKeys = {
  // Plants domain
  plants: {
    all: ['plants'] as const,
    lists: () => [...queryKeys.plants.all, 'getPlants'] as const,
    list: (params?: { filter?: string; sort?: string; page?: string }) =>
      [...queryKeys.plants.lists(), params] as const,
    details: () => [...queryKeys.plants.all, 'getPlant'] as const,
    detail: (id: string) => [...queryKeys.plants.details(), id] as const,
  },

  // Care logs domain
  careLogs: {
    all: ['careLogs'] as const,
    lists: () => [...queryKeys.careLogs.all, 'getCareLogs'] as const,
    list: (plantId: string) =>
      [...queryKeys.careLogs.lists(), plantId] as const,
    recentActivities: () =>
      [...queryKeys.careLogs.all, 'getRecentActivities'] as const,
  },

  // Care tasks domain
  careTasks: {
    all: ['careTasks'] as const,
    list: () => [...queryKeys.careTasks.all, 'getCareTasks'] as const,
  },

  // Subscriptions domain
  subscriptions: {
    all: ['subscriptions'] as const,
    current: () =>
      [...queryKeys.subscriptions.all, 'getCurrentSubscription'] as const,
  },

  // Users domain
  users: {
    all: ['users'] as const,
    current: () => [...queryKeys.users.all, 'getCurrentUser'] as const,
    settings: () => [...queryKeys.users.all, 'getUserSettings'] as const,
  },

  // Notifications domain
  notifications: {
    all: ['notifications'] as const,
    settings: () =>
      [...queryKeys.notifications.all, 'getNotificationSettings'] as const,
  },

  // Achievements domain
  achievements: {
    all: ['achievements'] as const,
    list: () => [...queryKeys.achievements.all, 'getAchievements'] as const,
  },

  // Rooms domain
  rooms: {
    all: ['rooms'] as const,
    list: () => [...queryKeys.rooms.all, 'getRooms'] as const,
  },

  // Auth domain
  auth: {
    all: ['auth'] as const,
    currentUser: () => [...queryKeys.auth.all, 'getCurrentUser'] as const,
  },

  // Chat domain
  chat: {
    all: ['chat'] as const,
    history: (plantId: string) =>
      [...queryKeys.chat.all, 'getChatHistory', plantId] as const,
  },
} as const

/**
 * Helper to invalidate all queries for a domain
 */
export const invalidateKeys = {
  plants: queryKeys.plants.all,
  careLogs: queryKeys.careLogs.all,
  careTasks: queryKeys.careTasks.all,
  subscriptions: queryKeys.subscriptions.all,
  users: queryKeys.users.all,
  notifications: queryKeys.notifications.all,
  rooms: queryKeys.rooms.all,
  achievements: queryKeys.achievements.all,
  auth: queryKeys.auth.all,
  chat: queryKeys.chat.all,
} as const
