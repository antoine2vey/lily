import { Array, Match, Option, pipe, String } from 'effect'
import { Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  source?: { uri: string } | number
  name?: string
  size?: AvatarSize
}

interface SizeStyles {
  dimension: number
  textClass: string
}

const getSizeStyles = (size: AvatarSize): SizeStyles =>
  pipe(
    Match.value(size),
    Match.when('sm', () => ({ dimension: 32, textClass: 'text-xs' })),
    Match.when('md', () => ({ dimension: 40, textClass: 'text-sm' })),
    Match.when('lg', () => ({ dimension: 56, textClass: 'text-xl' })),
    Match.when('xl', () => ({ dimension: 80, textClass: 'text-3xl' })),
    Match.exhaustive
  )

const getInitials = (name: string): string =>
  pipe(
    name,
    String.trim,
    String.split(' '),
    Array.filter((part) => part.length > 0),
    Array.take(2),
    Array.map((part) =>
      pipe(
        part,
        String.charAt(0),
        Option.map(String.toUpperCase),
        Option.getOrElse(() => '')
      )
    ),
    Array.join('')
  )

export function Avatar({ source, name, size = 'md' }: AvatarProps) {
  const sizeStyles = getSizeStyles(size)

  const initials = pipe(
    Option.fromNullable(name),
    Option.map(getInitials),
    Option.getOrElse(() => '?')
  )

  const fallback = (
    <View className="w-full h-full items-center justify-center bg-primary rounded-full">
      <Text className={`text-white font-semibold ${sizeStyles.textClass}`}>
        {initials}
      </Text>
    </View>
  )

  return source ? (
    <AnimatedImage
      source={source}
      rounded
      fallback={fallback}
      style={{
        width: sizeStyles.dimension,
        height: sizeStyles.dimension,
      }}
    />
  ) : (
    <View
      className="rounded-full overflow-hidden items-center justify-center bg-primary"
      style={{
        width: sizeStyles.dimension,
        height: sizeStyles.dimension,
      }}
    >
      <Text className={`text-white font-semibold ${sizeStyles.textClass}`}>
        {initials}
      </Text>
    </View>
  )
}
