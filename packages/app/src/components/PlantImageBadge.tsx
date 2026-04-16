import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { useIconColors } from '@/hooks/useIconColors'

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

interface PlantImageBadgeProps {
  imageUrl?: string | undefined
  size: number
  badgeIcon: MaterialIconName
  badgeColor: string
  badgeBgColor: string
}

export function PlantImageBadge({
  imageUrl,
  size,
  badgeIcon,
  badgeColor,
  badgeBgColor,
}: PlantImageBadgeProps) {
  const { isDark, primary } = useIconColors()
  const badgeSize = Math.round(size * 0.35)
  const badgeIconSize = Math.round(badgeSize * 0.6)
  const fallbackIconSize = Math.round(size * 0.5)

  return (
    <View className="relative">
      <View
        className="rounded-full overflow-hidden items-center justify-center"
        style={{
          width: size,
          height: size,
          backgroundColor: isDark ? '#374151' : '#FFFFFF',
          borderWidth: 2,
          borderColor: isDark ? '#4B5563' : 'white',
        }}
      >
        {imageUrl ? (
          <AnimatedImage
            source={{ uri: imageUrl }}
            className="w-full h-full"
            rounded
            fallback={
              <View
                className="w-full h-full items-center justify-center"
                style={{
                  backgroundColor: isDark ? '#2D3728' : '#E8F5E8',
                }}
              >
                <MaterialIcons
                  name="eco"
                  size={fallbackIconSize}
                  color={primary}
                />
              </View>
            }
          />
        ) : (
          <View
            className="w-full h-full items-center justify-center"
            style={{ backgroundColor: isDark ? '#2D3728' : '#E8F5E8' }}
          >
            <MaterialIcons name="eco" size={fallbackIconSize} color={primary} />
          </View>
        )}
      </View>
      <View
        className="absolute -bottom-0.5 -right-0.5 rounded-full items-center justify-center"
        style={{
          width: badgeSize,
          height: badgeSize,
          backgroundColor: badgeBgColor,
          borderWidth: 2,
          borderColor: isDark ? '#4B5563' : 'white',
        }}
      >
        <MaterialIcons
          name={badgeIcon}
          size={badgeIconSize}
          color={badgeColor}
        />
      </View>
    </View>
  )
}
