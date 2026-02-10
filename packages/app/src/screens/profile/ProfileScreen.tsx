import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, pipe, String } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Badge } from 'src/components/Badge'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useAuth } from 'src/contexts/AuthContext'
import { useAchievements } from 'src/hooks/useAchievements'
import { useIconColors } from 'src/hooks/useIconColors'
import { useLocalization } from 'src/hooks/useLocalization'
import { usePlants } from 'src/hooks/usePlants'
import { useSubscription } from 'src/hooks/useSubscription'
import { useUser } from 'src/hooks/useUser'
import { ProfileHeader } from 'src/screens/profile/components/ProfileHeader'
import { ProfileMenuItem } from 'src/screens/profile/components/ProfileMenuItem'
import { StatsCard } from 'src/screens/profile/components/StatsCard'

export function ProfileScreen() {
  const iconColors = useIconColors()
  const { t } = useLocalization()
  const { state, logout } = useAuth()
  const { data: user, isLoading: isLoadingUser } = useUser()
  const { data: plants, isLoading: isLoadingPlants } = usePlants()
  const { data: subscription, isLoading: isLoadingSubscription } =
    useSubscription()
  const { data: achievements, isLoading: isLoadingAchievements } =
    useAchievements()
  const insets = useSafeAreaInsets()
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const isLoading =
    isLoadingUser ||
    isLoadingPlants ||
    isLoadingSubscription ||
    isLoadingAchievements

  if (isLoading && !user && !plants) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
      </View>
    )
  }

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

      <ScrollView className="flex-1 px-0" showsVerticalScrollIndicator={false}>
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
        />

        {/* Stats Card */}
        <StatsCard stats={stats} />

        {/* Menu Items */}
        <View className="mt-4 gap-0">
          <ProfileMenuItem
            icon={
              <MaterialIcons name="edit" size={20} color={iconColors.primary} />
            }
            title={t('profile:actions.editProfile')}
            onPress={() => router.push('/profile/edit')}
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
            onPress={() => Linking.openURL('https://lily.app/help')}
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

        {/* Bottom spacer */}
        <View className="h-8" />
      </ScrollView>

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
