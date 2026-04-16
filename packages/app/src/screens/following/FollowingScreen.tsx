import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useFollowing } from '@/hooks/useFollowing'
import { useIconColors } from '@/hooks/useIconColors'
import { UserCardItem } from '@/screens/user-search/components/UserCardItem'
import { UserSearchSkeleton } from '@/screens/user-search/components/UserSearchSkeleton'

interface FollowingScreenProps {
  readonly userId?: string | undefined
}

export function FollowingScreen({ userId }: FollowingScreenProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const iconColors = useIconColors()
  const { data, isLoading } = useFollowing(userId)

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
        <Text
          className="flex-1 text-lg text-text-primary dark:text-white text-center mr-10"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          Following
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
                title="Not following anyone yet"
                description="Find and follow other plant lovers to see them here"
              />
            }
          />
        </Animated.View>
      )}
    </View>
  )
}
