import { Array, Match, Option, pipe, String } from 'effect'
import { Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  source?: { uri: string } | number | undefined
  name?: string | undefined
  size?: AvatarSize | undefined
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
    Array.filter(String.isNonEmpty),
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
  const { dimension, textClass } = getSizeStyles(size)

  const initials = pipe(
    Option.fromNullable(name),
    Option.map(getInitials),
    Option.getOrElse(() => '?')
  )

  const dimensionStyle = { width: dimension, height: dimension }

  const fallback = (
    <View className="w-full h-full items-center justify-center bg-primary rounded-full">
      <Text className={`text-white font-semibold ${textClass}`}>
        {initials}
      </Text>
    </View>
  )

  if (!source) {
    return (
      <View className="rounded-full overflow-hidden" style={dimensionStyle}>
        {fallback}
      </View>
    )
  }

  return (
    <AnimatedImage
      source={source}
      rounded
      fallback={fallback}
      style={dimensionStyle}
    />
  )
}
