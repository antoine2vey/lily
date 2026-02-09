import { Image, type ImageContentFit } from 'expo-image'
import { memo, type ReactNode, useState } from 'react'
import { type ImageSourcePropType, View, type ViewStyle } from 'react-native'

interface AnimatedImageProps {
  readonly source: ImageSourcePropType
  readonly style?: ViewStyle
  readonly className?: string
  readonly contentFit?: ImageContentFit
  readonly fallback?: ReactNode
  readonly rounded?: boolean
}

export const AnimatedImage = memo(function AnimatedImage({
  source,
  style,
  className,
  contentFit = 'cover',
  fallback,
  rounded = false,
}: AnimatedImageProps) {
  const [hasError, setHasError] = useState(false)

  const roundedClass = rounded ? 'rounded-full' : ''

  if (hasError && fallback) {
    return (
      <View className={`${roundedClass} ${className ?? ''}`} style={style}>
        {fallback}
      </View>
    )
  }

  return (
    <View
      className={`overflow-hidden ${roundedClass} ${className ?? ''}`}
      style={style}
    >
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        contentFit={contentFit}
        transition={300}
        cachePolicy="memory-disk"
        onError={() => setHasError(true)}
      />
    </View>
  )
})
