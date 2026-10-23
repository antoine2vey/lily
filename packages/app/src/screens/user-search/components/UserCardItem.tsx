import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useFollowUser } from '@/hooks/useFollowUser'
import { useIconColors } from '@/hooks/useIconColors'
import { useUnfollowUser } from '@/hooks/useUnfollowUser'

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
  const { t } = useTranslation('profile')
  const { state: authState } = useAuth()
  const iconColors = useIconColors()
  const followMutation = useFollowUser()
  const unfollowMutation = useUnfollowUser()

  const displayName = pipe(
    Option.fromNullishOr(name),
    Option.getOrElse(() => t('defaultName'))
  )

  const handlePress = useCallback(() => {
    router.push(`/public-profile/${id}` as const)
  }, [router, id])

  const handleFollowToggle = useCallback(() => {
    if (isFollowing) {
      unfollowMutation.mutate({ params: { userId: id } })
    } else {
      followMutation.mutate({ params: { userId: id } })
    }
  }, [isFollowing, id, followMutation, unfollowMutation])

  const isMutating = followMutation.isPending || unfollowMutation.isPending
  const isSelf = authState._tag === 'Authenticated' && authState.user.id === id

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
          {t('social.plantCount', { count: plantCount })}
        </Text>
      </View>

      {!isSelf && (
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
              {isFollowing ? t('social.followingButton') : t('social.follow')}
            </Text>
          )}
        </Pressable>
      )}
    </Pressable>
  )
}
