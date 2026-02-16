import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe, String } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from 'src/components/EmptyState'
import { useDebouncedValue } from 'src/hooks/useDebouncedValue'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { useSearchUsers } from 'src/hooks/useSearchUsers'
import { useSuggestedUsers } from 'src/hooks/useSuggestedUsers'
import { UserCardItem } from './components/UserCardItem'
import { UserSearchSkeleton } from './components/UserSearchSkeleton'

export function UserSearchScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const iconColors = useIconColors()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)

  const isSearching = String.isNonEmpty(String.trim(debouncedQuery))

  const { data: searchResults, isLoading: isSearchLoading } = useSearchUsers(
    debouncedQuery,
    isSearching
  )

  const { data: suggested, isLoading: isSuggestedLoading } = useSuggestedUsers()

  const isLoading = isSearching ? isSearchLoading : isSuggestedLoading
  const currentData = isSearching
    ? pipe(
        Option.fromNullable(searchResults),
        Option.map((r) => r.items),
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
    : pipe(
        Option.fromNullable(suggested),
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

  const isInitialLoading =
    isLoading && Array.isEmptyArray(currentData as unknown[])
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const handleClear = useCallback(() => {
    setQuery('')
  }, [])

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
      <View className="px-4 pt-2 pb-3">
        <View className="flex-row items-center mb-3">
          <Pressable
            onPress={() => router.back()}
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
            Find Friends
          </Text>
        </View>

        <View className="flex-row items-center gap-2 px-4 py-3 bg-input-bg dark:bg-slate-800 rounded-xl">
          <MaterialIcons name="search" size={20} color={iconColors.textMuted} />
          <TextInput
            className="flex-1 text-base text-text-primary dark:text-white"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name..."
            placeholderTextColor={iconColors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {String.isNonEmpty(query) && (
            <Pressable
              onPress={handleClear}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <MaterialIcons
                name="cancel"
                size={20}
                color={iconColors.textMuted}
              />
            </Pressable>
          )}
        </View>
      </View>

      {!isSearching && !Array.isEmptyArray(currentData as unknown[]) && (
        <View className="px-4 pt-2 pb-1">
          <Text
            className="text-xs text-text-muted dark:text-slate-400 uppercase tracking-wide"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            Suggested for you
          </Text>
        </View>
      )}

      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <UserSearchSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <FlatList
            data={
              currentData as {
                readonly id: string
                readonly name: string | null
                readonly image: string | null
                readonly plantCount: number
                readonly isFollowing: boolean
              }[]
            }
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerClassName="pb-24"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              isSearching ? (
                <EmptyState
                  illustration="search"
                  title="No users found"
                  description="Try searching with a different name"
                />
              ) : (
                <EmptyState
                  illustration="search"
                  title="No suggestions yet"
                  description="Search for people by name to find and follow other plant lovers"
                />
              )
            }
          />
        </Animated.View>
      )}
    </View>
  )
}
