import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { useIconColors } from '@/hooks/useIconColors'
import { useSearchUsers } from '@/hooks/useSearchUsers'
import { useSuggestedUsers } from '@/hooks/useSuggestedUsers'

export interface SelectedUser {
  id: string
  name: string | null
  image: string | null
}

interface UserPickerProps {
  label: string
  placeholder: string
  selectedUser: SelectedUser | null
  onSelect: (user: SelectedUser) => void
  onClear: () => void
}

const MIN_QUERY_LENGTH = 2

const displayName = (user: SelectedUser, unknown: string) =>
  pipe(
    Option.fromNullishOr(user.name),
    Option.getOrElse(() => unknown)
  )

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

function UserAvatar({ user }: { user: SelectedUser }) {
  return (
    <Avatar
      source={pipe(
        Option.fromNullishOr(user.image),
        Option.map((uri) => ({ uri })),
        Option.getOrUndefined
      )}
      name={pipe(
        Option.fromNullishOr(user.name),
        Option.getOrElse(() => 'User')
      )}
      size="sm"
    />
  )
}

function UserRow({
  user,
  onPress,
}: {
  user: SelectedUser
  onPress: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center p-3 active:bg-surface-tinted dark:active:bg-slate-700"
    >
      <UserAvatar user={user} />
      <View className="flex-1 ml-3">
        <Text className="text-sm font-medium text-text-primary dark:text-white">
          {displayName(user, t('unknown'))}
        </Text>
      </View>
    </Pressable>
  )
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300"
      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
    >
      {children}
    </Text>
  )
}

export function UserPicker({
  label,
  placeholder,
  selectedUser,
  onSelect,
  onClear,
}: UserPickerProps) {
  const { t } = useTranslation('common')
  const iconColors = useIconColors()
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const longEnough = query.length >= MIN_QUERY_LENGTH

  const { data: searchResults, isLoading: isSearching } = useSearchUsers(
    query,
    longEnough
  )
  const { data: suggested } = useSuggestedUsers()

  const handleSelect = ({ id, name, image }: SelectedUser) => {
    onSelect({ id, name, image })
    setQuery('')
    setIsFocused(false)
  }

  if (selectedUser) {
    return (
      <View className="gap-2">
        <FieldLabel>{label}</FieldLabel>
        <View className="flex-row items-center rounded-2xl px-4 py-3 bg-surface dark:bg-surface-dark border-2 border-primary/50">
          <UserAvatar user={selectedUser} />
          <Text
            className="flex-1 ml-3 text-base text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            {displayName(selectedUser, t('unknown'))}
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

  const users: ReadonlyArray<SelectedUser> = pipe(
    Option.fromNullishOr(searchResults?.items),
    Option.getOrElse(() => [])
  )
  const suggestedUsers: ReadonlyArray<SelectedUser> = pipe(
    Option.fromNullishOr(suggested),
    Option.getOrElse(() => [])
  )
  const showResults = isFocused && longEnough
  const showSuggested =
    isFocused && !longEnough && Arr.isReadonlyArrayNonEmpty(suggestedUsers)

  return (
    <View className="gap-2">
      <FieldLabel>{label}</FieldLabel>
      <View className="relative">
        <View className="flex-row items-center rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50">
          <MaterialIcons name="search" size={20} color={iconColors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder={placeholder}
            placeholderTextColor={iconColors.textMuted}
            className="flex-1 ml-2 text-base text-text-primary dark:text-white"
            autoCapitalize="none"
            testID="user-picker-input"
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
            ) : Arr.isReadonlyArrayEmpty(users) ? (
              <EmptyState kind="usersNoResults" variant="inline" />
            ) : (
              Arr.map(users, (user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onPress={() => handleSelect(user)}
                />
              ))
            )}
          </Animated.View>
        )}

        {showSuggested && (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="absolute top-14 left-0 right-0 z-10 rounded-xl bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 shadow-lg max-h-60 overflow-hidden"
          >
            <Text className="text-xs uppercase px-3 pt-3 pb-1 font-medium text-text-muted dark:text-slate-400">
              {t('userPicker.suggested')}
            </Text>
            {Arr.map(suggestedUsers, (user) => (
              <UserRow
                key={user.id}
                user={user}
                onPress={() => handleSelect(user)}
              />
            ))}
          </Animated.View>
        )}
      </View>
    </View>
  )
}
