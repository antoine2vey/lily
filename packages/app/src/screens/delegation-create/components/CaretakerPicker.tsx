import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Option, pipe } from 'effect'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Avatar } from '@/components/Avatar'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { useIconColors } from '@/hooks/useIconColors'
import { useSearchUsers } from '@/hooks/useSearchUsers'
import { useSuggestedUsers } from '@/hooks/useSuggestedUsers'
import type { SelectedUser } from '@/screens/delegation-create/types'

interface CaretakerPickerProps {
  selectedUser: SelectedUser | null
  onSelect: (user: SelectedUser) => void
  onClear: () => void
}

function SearchResultSkeleton() {
  return (
    <View className="flex-row items-center p-3">
      <SkeletonCircle size={40} />
      <View className="flex-1 ml-3">
        <SkeletonBox width="60%" height={16} rounded="sm" />
        <View className="mt-1">
          <SkeletonBox width="40%" height={12} rounded="sm" />
        </View>
      </View>
    </View>
  )
}

export function CaretakerPicker({
  selectedUser,
  onSelect,
  onClear,
}: CaretakerPickerProps) {
  const iconColors = useIconColors()
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  const { data: searchResults, isLoading: isSearching } = useSearchUsers(
    query,
    query.length >= 2
  )
  const { data: suggested } = useSuggestedUsers()

  const handleSelect = (user: {
    id: string
    name: string | null
    image: string | null
  }) => {
    onSelect({
      id: user.id,
      name: user.name,
      image: user.image,
    })
    setQuery('')
    setIsFocused(false)
  }

  if (selectedUser) {
    return (
      <View className="gap-2">
        <Text
          className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          Caretaker
        </Text>
        <View className="flex-row items-center rounded-2xl px-4 py-3 bg-surface dark:bg-surface-dark border-2 border-primary/50">
          <Avatar
            source={pipe(
              Option.fromNullable(selectedUser.image),
              Option.map((uri) => ({ uri })),
              Option.getOrUndefined
            )}
            name={pipe(
              Option.fromNullable(selectedUser.name),
              Option.getOrElse(() => 'User')
            )}
            size="sm"
          />
          <Text
            className="flex-1 ml-3 text-base text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            {pipe(
              Option.fromNullable(selectedUser.name),
              Option.getOrElse(() => 'Unknown')
            )}
          </Text>
          <Pressable
            onPress={onClear}
            className="w-8 h-8 items-center justify-center rounded-full bg-surface-tinted dark:bg-slate-700"
          >
            <MaterialIcons
              name="close"
              size={18}
              color={iconColors.textMuted}
            />
          </Pressable>
        </View>
      </View>
    )
  }

  const showResults = isFocused && query.length >= 2
  const showSuggested = isFocused && query.length < 2

  const users = [
    ...pipe(
      Option.fromNullable(searchResults?.items),
      Option.getOrElse(
        () =>
          [] as Array<{
            id: string
            name: string | null
            image: string | null
            plantCount: number
            isFollowing: boolean
          }>
      )
    ),
  ]

  const suggestedUsers = [
    ...pipe(
      Option.fromNullable(suggested),
      Option.getOrElse(
        () =>
          [] as Array<{
            id: string
            name: string | null
            image: string | null
            plantCount: number
            isFollowing: boolean
          }>
      )
    ),
  ]

  return (
    <View className="gap-2">
      <Text
        className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        Caretaker
      </Text>
      <View className="relative">
        <View className="flex-row items-center rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50">
          <MaterialIcons name="search" size={20} color={iconColors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Search for a caretaker..."
            placeholderTextColor={iconColors.textMuted}
            className="flex-1 ml-2 text-base text-text-primary dark:text-white"
            autoCapitalize="none"
          />
        </View>

        {showResults && (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="absolute top-14 left-0 right-0 z-10 rounded-xl bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 shadow-lg max-h-60 overflow-hidden"
          >
            {isSearching ? (
              <View>
                <SearchResultSkeleton />
                <SearchResultSkeleton />
              </View>
            ) : Arr.isEmptyArray(users) ? (
              <View className="p-4 items-center">
                <Text className="text-sm text-text-muted dark:text-slate-400">
                  No users found
                </Text>
              </View>
            ) : (
              Arr.map(users, (user) => (
                <Pressable
                  key={user.id}
                  onPress={() => handleSelect(user)}
                  className="flex-row items-center p-3 active:bg-surface-tinted dark:active:bg-slate-700"
                >
                  <Avatar
                    source={pipe(
                      Option.fromNullable(user.image),
                      Option.map((uri) => ({ uri })),
                      Option.getOrUndefined
                    )}
                    name={pipe(
                      Option.fromNullable(user.name),
                      Option.getOrElse(() => 'User')
                    )}
                    size="sm"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-sm font-medium text-text-primary dark:text-white">
                      {pipe(
                        Option.fromNullable(user.name),
                        Option.getOrElse(() => 'Unknown')
                      )}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </Animated.View>
        )}

        {showSuggested && Arr.isNonEmptyArray(suggestedUsers) && (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="absolute top-14 left-0 right-0 z-10 rounded-xl bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 shadow-lg max-h-60 overflow-hidden"
          >
            <Text className="text-xs uppercase px-3 pt-3 pb-1 font-medium text-text-muted dark:text-slate-400">
              Suggested
            </Text>
            {Arr.map(suggestedUsers, (user) => (
              <Pressable
                key={user.id}
                onPress={() => handleSelect(user)}
                className="flex-row items-center p-3 active:bg-surface-tinted dark:active:bg-slate-700"
              >
                <Avatar
                  source={pipe(
                    Option.fromNullable(user.image),
                    Option.map((uri) => ({ uri })),
                    Option.getOrUndefined
                  )}
                  name={pipe(
                    Option.fromNullable(user.name),
                    Option.getOrElse(() => 'User')
                  )}
                  size="sm"
                />
                <View className="flex-1 ml-3">
                  <Text className="text-sm font-medium text-text-primary dark:text-white">
                    {pipe(
                      Option.fromNullable(user.name),
                      Option.getOrElse(() => 'Unknown')
                    )}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}
      </View>
    </View>
  )
}
