import { Array, Match, Option, pipe, String } from 'effect'
import { useState } from 'react'
import { Image, Text, View } from 'react-native'

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
  const [imageError, setImageError] = useState(false)
  const sizeStyles = getSizeStyles(size)

  const showFallback = !source || imageError

  const initials = pipe(
    Option.fromNullable(name),
    Option.map(getInitials),
    Option.getOrElse(() => '?')
  )

  const bgClass = showFallback ? 'bg-primary' : 'bg-surface'

  return (
    <View
      className={`rounded-full overflow-hidden items-center justify-center ${bgClass}`}
      style={{
        width: sizeStyles.dimension,
        height: sizeStyles.dimension,
      }}
    >
      {showFallback ? (
        <Text className={`text-white font-semibold ${sizeStyles.textClass}`}>
          {initials}
        </Text>
      ) : (
        <Image
          source={source}
          style={{
            width: sizeStyles.dimension,
            height: sizeStyles.dimension,
          }}
          onError={() => setImageError(true)}
        />
      )}
    </View>
  )
}
