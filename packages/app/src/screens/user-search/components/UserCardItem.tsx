import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { useFollowUser } from 'src/hooks/useFollowUser'
import { useIconColors } from 'src/hooks/useIconColors'
import { useUnfollowUser } from 'src/hooks/useUnfollowUser'

interface UserCardItemProps {
  readonly id: string
  readonly name: string | null
  readonly image: string | null
  readonly plantCount: number
  readonly isFollowing: boolean
}

export function UserCardItem({
  id,
  name,
  image,
  plantCount,
  isFollowing,
}: UserCardItemProps) {
  const router = useRouter()
  const iconColors = useIconColors()
  const followMutation = useFollowUser()
  const unfollowMutation = useUnfollowUser()

  const displayName = pipe(
    Option.fromNullable(name),
    Option.getOrElse(() => 'User')
  )

  const handlePress = useCallback(() => {
    router.push(`/public-profile/${id}` as const)
  }, [router, id])

  const handleFollowToggle = useCallback(() => {
    if (isFollowing) {
      unfollowMutation.mutate({ path: { userId: id } })
    } else {
      followMutation.mutate({ path: { userId: id } })
    }
  }, [isFollowing, id, followMutation, unfollowMutation])

  const isMutating = followMutation.isPending || unfollowMutation.isPending

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center px-4 py-3"
    >
      <View className="w-10 h-10 rounded-full bg-surface-tinted dark:bg-slate-700 items-center justify-center overflow-hidden">
        {image ? (
          <Image source={{ uri: image }} className="w-10 h-10 rounded-full" />
        ) : (
          <MaterialIcons name="person" size={24} color={iconColors.textMuted} />
        )}
      </View>

      <View className="flex-1 ml-3">
        <Text
          className="text-base text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        <Text className="text-sm text-text-muted dark:text-slate-400">
          {plantCount} {plantCount === 1 ? 'plant' : 'plants'}
        </Text>
      </View>

      <Pressable
        onPress={handleFollowToggle}
        disabled={isMutating}
        className={
          isFollowing
            ? 'border border-primary dark:border-primary-light rounded-xl px-4 py-2'
            : 'bg-primary rounded-xl px-4 py-2'
        }
      >
        {isMutating ? (
          <ActivityIndicator
            size="small"
            color={isFollowing ? '#5B8C5A' : '#FFFFFF'}
          />
        ) : (
          <Text
            className={
              isFollowing
                ? 'text-sm text-primary dark:text-primary-light'
                : 'text-sm text-white'
            }
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        )}
      </Pressable>
    </Pressable>
  )
}
