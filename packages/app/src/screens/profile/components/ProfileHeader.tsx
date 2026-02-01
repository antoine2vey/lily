import { type DateInput, formatMemberSince, parseApiDate } from '@lily/shared'
import { Option, pipe } from 'effect'
import { Image, Text, View } from 'react-native'

interface ProfileHeaderProps {
  avatarUrl: Option.Option<string>
  name: string
  username?: string
  memberSince: DateInput
}

export function ProfileHeader({
  avatarUrl,
  name,
  username,
  memberSince,
}: ProfileHeaderProps) {
  const memberSinceFormatted = pipe(
    parseApiDate(memberSince),
    Option.map(formatMemberSince),
    Option.getOrElse(() => 'Unknown')
  )

  return (
    <View className="items-center pt-2 pb-4">
      {/* Avatar */}
      <View className="w-20 h-20 rounded-full p-1 border-2 border-primary bg-surface dark:bg-surface-dark mb-3">
        {pipe(
          avatarUrl,
          Option.match({
            onNone: () => (
              <View className="w-full h-full rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
                <Text className="text-2xl font-bold text-primary">
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
            ),
            onSome: (url) => (
              <Image
                source={{ uri: url }}
                className="w-full h-full rounded-full"
                resizeMode="cover"
              />
            ),
          })
        )}
      </View>

      {/* Name */}
      <Text className="text-xl font-bold text-text-primary dark:text-white">
        {name}
      </Text>

      {/* Username */}
      {username && (
        <Text className="text-sm font-medium text-text-muted dark:text-slate-400">
          @{username}
        </Text>
      )}

      {/* Member Since Badge */}
      <View className="mt-3 px-3 py-1 bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-full">
        <Text className="text-xs font-semibold text-text-muted dark:text-slate-400 tracking-wide">
          Member since {memberSinceFormatted}
        </Text>
      </View>
    </View>
  )
}
