import { Option, pipe } from 'effect'
import { Image, Text, View } from 'react-native'

interface ProfileHeaderProps {
  avatarUrl: Option.Option<string>
  name: string
  username?: string
  memberSince: Date
}

export function ProfileHeader({
  avatarUrl,
  name,
  username,
  memberSince,
}: ProfileHeaderProps) {
  const memberSinceFormatted = memberSince.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })

  return (
    <View className="items-center py-6">
      {/* Avatar */}
      <View className="w-24 h-24 rounded-full items-center justify-center mb-4 border-[3px] border-primary">
        {pipe(
          avatarUrl,
          Option.match({
            onNone: () => (
              <View className="w-full h-full rounded-full items-center justify-center bg-primary-tint">
                <Text className="text-3xl font-bold text-primary">
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
      <Text className="text-2xl mb-1 font-bold text-text-primary">{name}</Text>

      {/* Username */}
      {username && (
        <Text className="text-sm mb-3 font-regular text-text-secondary">
          @{username}
        </Text>
      )}

      {/* Member Since Badge */}
      <View className="px-4 py-1.5 rounded-full border border-border">
        <Text className="text-sm font-medium text-text-muted">
          Member since {memberSinceFormatted}
        </Text>
      </View>
    </View>
  )
}
