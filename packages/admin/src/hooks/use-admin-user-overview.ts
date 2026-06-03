import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

// Focused view of the overview payload. Dates are typed as strings because the
// wire format is JSON (the API encodes Schema.Date to ISO strings).

export interface AdminUserProfile {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly firstName: string | null
  readonly lastName: string | null
  readonly image: string | null
  readonly bio: string | null
  readonly role: string
  readonly status: string
  readonly emailVerified: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
  readonly timezone: string | null
  readonly language: string
  readonly temperatureUnit: string
  readonly careReminders: boolean
  readonly weeklyDigest: boolean
  readonly achievementNotifications: boolean
  readonly tips: boolean
  readonly productUpdates: boolean
  readonly ads: boolean
  readonly doNotDisturb: boolean
  readonly doNotDisturbStart: string | null
  readonly doNotDisturbEnd: string | null
  readonly publicProfile: boolean
  readonly shareGrowthData: boolean
  readonly personalizedTips: boolean
  readonly weatherEnabled: boolean
  readonly latitude: number | null
  readonly longitude: number | null
}

export interface AdminSubscriptionInfo {
  readonly subscription: {
    readonly tier: string
    readonly status: string
    readonly currentPeriodStart: string
    readonly currentPeriodEnd: string
    readonly trialStartsAt: string | null
    readonly trialEndsAt: string | null
  } | null
  readonly usage: {
    readonly aiChatsCount: number
    readonly cardScansCount: number
    readonly plantIdentifiesCount: number
  } | null
  readonly tierConfig: {
    readonly tier: string
    readonly name: string
    readonly maxPlants: number | null
    readonly maxAiChatsMonthly: number | null
    readonly maxCardScansMonthly: number | null
    readonly maxPlantIdentifiesMonthly: number | null
  }
}

export interface AdminUserStats {
  readonly plantCount: number
  readonly careLogsCount: number
  readonly achievementsCount: number
  readonly activeDeviceCount: number
  readonly roomsCount: number
}

export interface AdminRecentActivity {
  readonly id: string
  readonly type: string
  readonly plantId: string
  readonly plantName: string
  readonly plantImageUrl?: string
  readonly date: string
  readonly notes?: string
}

export interface AdminUserOverview {
  readonly user: AdminUserProfile
  readonly subscription: AdminSubscriptionInfo
  readonly isStorePayer: boolean
  readonly store: string | null
  readonly productId: string | null
  readonly stats: AdminUserStats
  readonly recentActivity: ReadonlyArray<AdminRecentActivity>
}

export const useAdminUserOverview = (id: string) =>
  useQuery({
    queryKey: ['admin-user-overview', id],
    queryFn: () =>
      apiRequest<AdminUserOverview>(`/api/admin/users/${id}/overview`),
    enabled: !!id,
  })
