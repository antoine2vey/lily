import { Image, type ImageContentFit, type ImageSource } from 'expo-image'
import { memo, type ReactNode, useState } from 'react'
import { View, type ViewStyle } from 'react-native'

type ResolvedSource =
  | string
  | number
  | ImageSource
  | { uri?: string | undefined }
  | null
  | undefined

interface AnimatedImageProps {
  readonly source: ResolvedSource
  readonly style?: ViewStyle | undefined
  readonly className?: string | undefined
  readonly contentFit?: ImageContentFit | undefined
  readonly fallback?: ReactNode | undefined
  readonly rounded?: boolean | undefined
}

const normalizeSource = (
  source: ResolvedSource
): string | number | ImageSource | null => {
  if (source == null) return null
  if (typeof source === 'string' || typeof source === 'number') return source
  if ('uri' in source && source.uri === undefined) return null
  return source as ImageSource
}

export const AnimatedImage = memo(function AnimatedImage({
  source,
  style,
  className = '',
  contentFit = 'cover',
  fallback,
  rounded = false,
}: AnimatedImageProps) {
  const [hasError, setHasError] = useState(false)

  const roundedClass = rounded ? 'rounded-full' : ''

  if (hasError && fallback) {
    return (
      <View className={`${roundedClass} ${className}`} style={style}>
        {fallback}
      </View>
    )
  }

  return (
    <View
      className={`overflow-hidden ${roundedClass} ${className}`}
      style={style}
    >
      <Image
        source={normalizeSource(source)}
        style={{ width: '100%', height: '100%' }}
        contentFit={contentFit}
        transition={300}
        cachePolicy="memory-disk"
        onError={() => setHasError(true)}
      />
    </View>
  )
})
