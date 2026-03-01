import { MaterialIcons } from '@expo/vector-icons'
import type { PublicPlantPreview } from '@lily/shared'
import { Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from 'src/components/EmptyState'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useFollowUser } from 'src/hooks/useFollowUser'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePublicProfile } from 'src/hooks/usePublicProfile'
import { useSendNudge } from 'src/hooks/useSendNudge'
import { useUnfollowUser } from 'src/hooks/useUnfollowUser'
import { PlantGrid } from './components/PlantGrid'
import { PlantPreviewModal } from './components/PlantPreviewModal'
import { ProfileStats } from './components/ProfileStats'
import { PublicProfileSkeleton } from './components/PublicProfileSkeleton'

interface PublicProfileScreenProps {
  readonly userId: string
}

export function PublicProfileScreen({ userId }: PublicProfileScreenProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const iconColors = useIconColors()
  const { data: profile, isLoading, apiError } = usePublicProfile(userId)
  const followMutation = useFollowUser()
  const unfollowMutation = useUnfollowUser()
  const nudgeMutation = useSendNudge()

  const [selectedPlant, setSelectedPlant] = useState<PublicPlantPreview | null>(
    null
  )

  const isInitialLoading = isLoading && !profile
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const displayName = pipe(
    Option.fromNullable(profile),
    Option.flatMap((p) => Option.fromNullable(p.name)),
    Option.getOrElse(() => 'User')
  )

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleFollowToggle = useCallback(() => {
    if (!profile) return
    if (profile.isFollowing) {
      unfollowMutation.mutate({ path: { userId } })
    } else {
      followMutation.mutate({ path: { userId } })
    }
  }, [profile, userId, followMutation, unfollowMutation])

  const handleNudge = useCallback(() => {
    nudgeMutation.mutate({ payload: { targetUserId: userId } })
  }, [userId, nudgeMutation])

  const handleFollowersPress = useCallback(() => {
    router.push(`/followers/${userId}` as const)
  }, [router, userId])

  const handleFollowingPress = useCallback(() => {
    router.push(`/following/${userId}` as const)
  }, [router, userId])

  const isFollowPending = followMutation.isPending || unfollowMutation.isPending

  const hasError = !!apiError

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <View className="flex-1" />
      </View>

      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <PublicProfileSkeleton />
        </Animated.View>
      ) : hasError ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <EmptyState
            title="Profile unavailable"
            description="This profile may be private or doesn't exist"
          />
        </Animated.View>
      ) : isInitialLoading ? null : profile ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerClassName="pb-8"
          >
            <View className="items-center pt-4 px-4">
              <View className="w-20 h-20 rounded-full p-1 border-2 border-primary bg-surface dark:bg-surface-dark mb-3">
                {pipe(
                  Option.fromNullable(profile.image),
                  Option.match({
                    onNone: () => (
                      <View className="w-full h-full rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
                        <Text
                          className="text-2xl text-primary"
                          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                        >
                          {pipe(
                            Option.fromNullable(profile.name),
                            Option.map((n) => n.charAt(0)),
                            Option.getOrElse(() => '?')
                          )}
                        </Text>
                      </View>
                    ),
                    onSome: (url) => (
                      <Image
                        source={{ uri: url }}
                        className="w-full h-full rounded-full"
                      />
                    ),
                  })
                )}
              </View>

              <Text
                className="text-xl text-text-primary dark:text-white"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
              >
                {displayName}
              </Text>

              {profile.bio && (
                <Text className="text-sm text-text-secondary dark:text-slate-400 text-center mt-1 px-8">
                  {profile.bio}
                </Text>
              )}

              <View className="mt-3 px-3 py-1 bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-full">
                <Text
                  className="text-xs text-text-muted dark:text-slate-400 tracking-wide"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  Member since{' '}
                  {new Date(profile.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>

            <View className="mt-6">
              <ProfileStats
                stats={[
                  { value: profile.plantCount, label: 'Plants' },
                  {
                    value: profile.followerCount,
                    label: 'Followers',
                    onPress: handleFollowersPress,
                  },
                  {
                    value: profile.followingCount,
                    label: 'Following',
                    onPress: handleFollowingPress,
                  },
                ]}
              />
            </View>

            <View className="mt-6">
              <PlantGrid
                plants={profile.recentPlants ?? []}
                onPress={setSelectedPlant}
              />
            </View>

            <View className="mt-6 px-4 gap-3">
              <Pressable
                onPress={handleFollowToggle}
                disabled={isFollowPending}
                className={
                  profile.isFollowing
                    ? 'border border-primary dark:border-primary-light rounded-xl py-4 items-center'
                    : 'bg-primary rounded-xl py-4 items-center'
                }
              >
                {isFollowPending ? (
                  <ActivityIndicator
                    size="small"
                    color={profile.isFollowing ? '#5B8C5A' : '#FFFFFF'}
                  />
                ) : (
                  <Text
                    className={
                      profile.isFollowing
                        ? 'text-base text-primary dark:text-primary-light'
                        : 'text-base text-white'
                    }
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                  >
                    {profile.isFollowing ? 'Following' : 'Follow'}
                  </Text>
                )}
              </Pressable>

              {profile.isFollowing && (
                <Pressable
                  onPress={handleNudge}
                  disabled={nudgeMutation.isPending}
                  className="border border-border dark:border-slate-700 rounded-xl py-3 items-center flex-row justify-center gap-2"
                >
                  {nudgeMutation.isPending ? (
                    <ActivityIndicator
                      size="small"
                      color={iconColors.textMuted}
                    />
                  ) : (
                    <>
                      <MaterialIcons
                        name="notifications-active"
                        size={18}
                        color={iconColors.textSecondary}
                      />
                      <Text
                        className="text-sm text-text-secondary dark:text-slate-400"
                        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                      >
                        Nudge to water
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      ) : null}

      <PlantPreviewModal
        plant={selectedPlant}
        ownerName={displayName}
        visible={selectedPlant !== null}
        onClose={() => setSelectedPlant(null)}
      />
    </View>
  )
}
