import { MaterialIcons } from '@expo/vector-icons'
import { Match, Option, pipe } from 'effect'
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
import { SafeAreaView } from 'react-native-safe-area-context'
import { Badge } from 'src/components/Badge'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useAuth } from 'src/contexts/AuthContext'
import { useAchievements } from 'src/hooks/useAchievements'
import { usePlants } from 'src/hooks/usePlants'
import { useSubscription } from 'src/hooks/useSubscription'
import { useUser } from 'src/hooks/useUser'
import { iconColors } from 'src/theme'
import { ProfileHeader } from './components/ProfileHeader'
import { ProfileMenuItem } from './components/ProfileMenuItem'
import { StatsCard } from './components/StatsCard'

export function ProfileScreen() {
  const { state, logout } = useAuth()
  const { data: user, isLoading: isLoadingUser } = useUser()
  const { data: plants, isLoading: isLoadingPlants } = usePlants()
  const { data: subscription, isLoading: isLoadingSubscription } =
    useSubscription()
  const { data: achievements, isLoading: isLoadingAchievements } =
    useAchievements()
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const isLoading =
    isLoadingUser ||
    isLoadingPlants ||
    isLoadingSubscription ||
    isLoadingAchievements

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const plantsCount = plants?.total ?? 0
  // Mock care logs count - in production this would come from an API
  const careLogsCount = 156
  const achievementsProgress = achievements
    ? `${achievements.unlockedCount}/${achievements.totalCount}`
    : '0/0'

  const stats = [
    { value: plantsCount, label: 'Plants' },
    { value: careLogsCount, label: 'Care Logs' },
    { value: achievementsProgress, label: 'Achievements' },
  ]

  const getSubscriptionBadge = () => {
    if (!subscription) return null

    return pipe(
      Match.value(subscription.tierConfig.tier),
      Match.when('paid', () => (
        <Badge label="PREMIUM" variant="success" size="sm" />
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
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="w-10" />
        <Text className="text-lg font-semibold text-text-primary">Profile</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="settings"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <ProfileHeader
          avatarUrl={pipe(
            Option.fromNullable(user?.image),
            Option.flatMap(Option.fromNullable)
          )}
          name={user?.name ?? 'Plant Lover'}
          username={user?.email?.split('@')[0]}
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
        <View className="mt-6">
          <ProfileMenuItem
            icon={
              <MaterialIcons name="edit" size={20} color={iconColors.primary} />
            }
            title="Edit Profile"
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
            title="Subscription"
            badge={getSubscriptionBadge()}
            onPress={() => router.push('/subscription')}
          />

          <ProfileMenuItem
            icon={
              <MaterialIcons
                name="emoji-events"
                size={20}
                color={iconColors.primary}
              />
            }
            title="My Achievements"
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
            title="Help & Support"
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
            title="Settings"
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
            title="About"
            onPress={() => router.push('/about')}
          />
        </View>

        {/* Sign Out Button */}
        <View className="items-center py-8">
          <Pressable onPress={() => setShowSignOutConfirm(true)}>
            <Text className="text-base font-semibold text-coral">Sign Out</Text>
          </Pressable>
        </View>

        {/* Bottom spacer */}
        <View className="h-8" />
      </ScrollView>

      {/* Sign Out Confirmation Modal */}
      <ConfirmationModal
        visible={showSignOutConfirm}
        title="Sign Out?"
        message="Are you sure you want to sign out? You'll need to sign in again to access your plants."
        confirmLabel={isSigningOut ? 'Signing Out...' : 'Sign Out'}
        cancelLabel="Cancel"
        destructive
        icon={
          <MaterialIcons name="logout" size={28} color={iconColors.coral} />
        }
        onConfirm={handleSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </SafeAreaView>
  )
}
