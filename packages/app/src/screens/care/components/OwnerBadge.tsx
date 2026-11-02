import { Option, pipe } from 'effect'
import { View } from 'react-native'
import { Avatar } from '@/components/Avatar'

interface OwnerBadgeProps {
  name: string | null
  image?: string | null | undefined
}

export function OwnerBadge({ name, image }: OwnerBadgeProps) {
  return (
    <View className="absolute -right-1 -bottom-1 rounded-full border-2 border-surface dark:border-surface-dark">
      <Avatar
        source={pipe(
          Option.fromNullishOr(image),
          Option.map((uri) => ({ uri })),
          Option.getOrUndefined
        )}
        name={name}
        size="xs"
      />
    </View>
  )
}
