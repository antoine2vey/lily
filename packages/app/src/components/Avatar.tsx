import { Array, Match, Option, pipe, String } from 'effect'
import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  source?: { uri: string } | number
  name?: string
  size?: AvatarSize
}

interface SizeStyles {
  dimension: number
  fontSize: number
}

const getSizeStyles = (size: AvatarSize): SizeStyles =>
  pipe(
    Match.value(size),
    Match.when('sm', () => ({ dimension: 32, fontSize: 12 })),
    Match.when('md', () => ({ dimension: 40, fontSize: 14 })),
    Match.when('lg', () => ({ dimension: 56, fontSize: 20 })),
    Match.when('xl', () => ({ dimension: 80, fontSize: 28 })),
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

  return (
    <View
      className="rounded-full overflow-hidden items-center justify-center"
      style={{
        width: sizeStyles.dimension,
        height: sizeStyles.dimension,
        backgroundColor: showFallback ? colors.primary : colors.surface,
      }}
    >
      {showFallback ? (
        <Text
          style={{
            color: colors.white,
            fontSize: sizeStyles.fontSize,
            fontFamily: fonts.semiBold,
          }}
        >
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
