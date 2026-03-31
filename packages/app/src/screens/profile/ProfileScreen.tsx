import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, pipe, String } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Badge } from 'src/components/Badge'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'
import { WEBSITE_BASE_URL } from 'src/constants/urls'
import { useAuth } from 'src/contexts/AuthContext'
import { useAchievements } from 'src/hooks/useAchievements'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { useLocalization } from 'src/hooks/useLocalization'
import { useMyDelegations } from 'src/hooks/useMyDelegations'
import { usePlants } from 'src/hooks/usePlants'
import { useSocialStats } from 'src/hooks/useSocialStats'
import { useSubscription } from 'src/hooks/useSubscription'
import { useUser } from 'src/hooks/useUser'
import { ProfileHeader } from 'src/screens/profile/components/ProfileHeader'
import { ProfileMenuItem } from 'src/screens/profile/components/ProfileMenuItem'
import { StatsCard } from 'src/screens/profile/components/StatsCard'
import { useTabBarInset } from '@/contexts/TabBarInsetContext'

function ProfileContentSkeleton() {
  return (
    <View className="px-4">
      {/* Profile Header Skeleton */}
      <View className="items-center py-6">
        <SkeletonCircle size={80} />
        <View className="mt-3">
          <SkeletonBox width={140} height={20} rounded="sm" />
        </View>
        <View className="mt-2">
          <SkeletonBox width={100} height={14} rounded="sm" />
        </View>
        <View className="flex-row gap-6 mt-4">
          <View className="items-center gap-1">
            <SkeletonBox width={30} height={16} rounded="sm" />
            <SkeletonBox width={60} height={12} rounded="sm" />
          </View>
          <View className="items-center gap-1">
            <SkeletonBox width={30} height={16} rounded="sm" />
            <SkeletonBox width={60} height={12} rounded="sm" />
          </View>
        </View>
      </View>

      {/* Stats Card Skeleton */}
      <View className="flex-row gap-3 mb-4">
        {Array.map([1, 2, 3], (i) => (
          <View
            key={i}
            className="flex-1 bg-surface dark:bg-surface-dark rounded-xl py-4 items-center"
          >
            <SkeletonBox width={32} height={24} rounded="sm" className="mb-1" />
            <SkeletonBox width={48} height={12} rounded="sm" />
          </View>
        ))}
      </View>

      {/* Menu Items Skeleton */}
      <View className="gap-0">
        {Array.map([1, 2, 3, 4, 5, 6], (i) => (
          <View key={i} className="flex-row items-center p-4 gap-3">
            <SkeletonCircle size={36} />
            <SkeletonBox width="60%" height={16} rounded="sm" />
          </View>
        ))}
      </View>
    </View>
  )
}

export function ProfileScreen() {
  const iconColors = useIconColors()
  const { t, language } = useLocalization()
  const { state, logout } = useAuth()
  const { data: user, isLoading: isLoadingUser } = useUser()
  const { data: plants, isLoading: isLoadingPlants } = usePlants()
  const { data: subscription, isLoading: isLoadingSubscription } =
    useSubscription()
  const { data: achievements, isLoading: isLoadingAchievements } =
    useAchievements()
  const { followerCount, followingCount } = useSocialStats()
  const { data: delegationsData } = useMyDelegations({
    role: 'both',
    status: 'active',
  })
  const insets = useSafeAreaInsets()
  const tabBarInset = useTabBarInset()
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const isLoading =
    isLoadingUser ||
    isLoadingPlants ||
    isLoadingSubscription ||
    isLoadingAchievements

  const isInitialLoading = isLoading && !user && !plants
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const activeDelegationCount = pipe(
    Option.fromNullable(delegationsData?.total),
    Option.getOrElse(() => 0)
  )

  const plantsCount = Option.getOrElse(
    Option.fromNullable(plants?.total),
    () => 0
  )
  // Mock care logs count - in production this would come from an API
  const careLogsCount = 156
  const achievementsProgress = achievements
    ? `${achievements.unlockedCount}/${achievements.totalCount}`
    : '0/0'

  const stats = [
    { value: plantsCount, label: t('profile:stats.plants') },
    { value: careLogsCount, label: t('profile:stats.careLogs') },
    { value: achievementsProgress, label: t('profile:stats.achievements') },
  ]

  const getSubscriptionBadge = () => {
    if (!subscription) return null

    return pipe(
      Match.value(subscription.tierConfig.tier),
      Match.when('paid', () => (
        <Badge label={t('profile:premiumBadge')} variant="success" size="sm" />
      )),
      Match.when('free', () => null),
      Match.exhaustive
    )
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await logout()
      // Navigation will be handled by AuthContext
    } finally {
      setIsSigningOut(false)
      setShowSignOutConfirm(false)
    }
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View className="w-12" />
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('profile:title')}
        </Text>
        <Pressable
          onPress={() => router.push('/settings')}
          className="w-12 h-12 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="settings"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
      </View>

      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <ProfileContentSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <ScrollView
            className="flex-1 px-0"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: tabBarInset }}
          >
            {/* Profile Header */}
            <ProfileHeader
              avatarUrl={pipe(
                Option.fromNullable(user?.image),
                Option.flatMap(Option.fromNullable)
              )}
              name={Option.getOrElse(Option.fromNullable(user?.name), () =>
                t('profile:defaultBio')
              )}
              username={pipe(
                Option.fromNullable(user?.email),
                Option.flatMap((email) => Array.head(String.split(email, '@'))),
                Option.getOrUndefined
              )}
              memberSince={pipe(
                Match.value(state),
                Match.when({ _tag: 'Authenticated' }, (s) => s.user.createdAt),
                Match.when({ _tag: 'NeedsUsername' }, (s) => s.user.createdAt),
                Match.orElse(() => undefined)
              )}
              followerCount={followerCount}
              followingCount={followingCount}
            />

            {/* Stats Card */}
            <StatsCard stats={stats} />

            {/* Menu Items */}
            <View className="mt-4 gap-0">
              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="edit"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.editProfile')}
                onPress={() => router.push('/profile/edit')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="search"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.findFriends')}
                onPress={() => router.push('/user-search')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="volunteer-activism"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title="Delegations"
                badge={
                  activeDelegationCount > 0 ? (
                    <Badge
                      label={`${activeDelegationCount}`}
                      variant="success"
                      size="sm"
                    />
                  ) : undefined
                }
                onPress={() => router.push('/delegations')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="star"
                    size={20}
                    color={iconColors.achievementGold}
                  />
                }
                title={t('profile:actions.subscription')}
                badge={getSubscriptionBadge()}
                onPress={() => router.push('/subscription')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="meeting-room"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.rooms')}
                onPress={() => router.push('/rooms')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="emoji-events"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.achievements')}
                onPress={() => router.push('/achievements')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="help-outline"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.helpSupport')}
                onPress={() =>
                  Linking.openURL(`${WEBSITE_BASE_URL}/${language}`)
                }
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="settings"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.settings')}
                onPress={() => router.push('/settings')}
              />

              <ProfileMenuItem
                icon={
                  <MaterialIcons
                    name="info-outline"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={t('profile:actions.about')}
                onPress={() => router.push('/about')}
              />
            </View>

            {/* Sign Out Button */}
            <View className="items-center py-8">
              <Pressable onPress={() => setShowSignOutConfirm(true)}>
                <Text className="text-base font-semibold text-coral">
                  {t('profile:actions.signOut')}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      )}

      {/* Sign Out Confirmation Modal */}
      <ConfirmationModal
        visible={showSignOutConfirm}
        title={t('profile:signOut.title')}
        message={t('profile:signOut.message')}
        confirmLabel={
          isSigningOut
            ? t('profile:signOut.signingOut')
            : t('profile:signOut.confirmButton')
        }
        cancelLabel={t('common:buttons.cancel')}
        destructive
        icon={
          <MaterialIcons name="logout" size={28} color={iconColors.coral} />
        }
        onConfirm={handleSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </View>
  )
}
