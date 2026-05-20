import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useFollowers } from '@/hooks/useFollowers'
import { useIconColors } from '@/hooks/useIconColors'
import { UserCardItem } from '@/screens/user-search/components/UserCardItem'
import { UserSearchSkeleton } from '@/screens/user-search/components/UserSearchSkeleton'

interface FollowersScreenProps {
  readonly userId?: string | undefined
}

export function FollowersScreen({ userId }: FollowersScreenProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const iconColors = useIconColors()
  const { data, isLoading } = useFollowers(userId)

  const items = pipe(
    Option.fromNullable(data),
    Option.map((d) => d.items),
    Option.getOrElse(
      () =>
        [] as readonly {
          readonly id: string
          readonly name: string | null
          readonly image: string | null
          readonly plantCount: number
          readonly isFollowing: boolean
        }[]
    )
  )

  const isInitialLoading = isLoading && Array.isEmptyArray(items as unknown[])
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const renderItem = useCallback(
    ({
      item,
    }: {
      item: {
        readonly id: string
        readonly name: string | null
        readonly image: string | null
        readonly plantCount: number
        readonly isFollowing: boolean
      }
    }) => (
      <UserCardItem
        id={item.id}
        name={item.name}
        image={item.image}
        plantCount={item.plantCount}
        isFollowing={item.isFollowing}
      />
    ),
    []
  )

  const keyExtractor = useCallback(
    (item: { readonly id: string }) => item.id,
    []
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <GlassBackButton onPress={handleBack} />
        <Text
          className="flex-1 text-lg text-text-primary dark:text-white text-center mr-10"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          Followers
        </Text>
      </View>

      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <UserSearchSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <FlatList
            data={
              items as {
                readonly id: string
                readonly name: string | null
                readonly image: string | null
                readonly plantCount: number
                readonly isFollowing: boolean
              }[]
            }
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                title="No followers yet"
                description="When people follow this account, they'll appear here"
              />
            }
          />
        </Animated.View>
      )}
    </View>
  )
}
