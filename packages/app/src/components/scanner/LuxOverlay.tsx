import { MaterialIcons } from '@expo/vector-icons'
import type { LuminosityLevel } from '@lily/shared'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

const LEVEL_CONFIG: Record<
  LuminosityLevel,
  { icon: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  1: { icon: 'nights-stay', color: '#6B7280' },
  2: { icon: 'cloud', color: '#9CA3AF' },
  3: { icon: 'wb-cloudy', color: '#F59E0B' },
  4: { icon: 'wb-sunny', color: '#F97316' },
  5: { icon: 'brightness-7', color: '#EF4444' },
}

const LEVEL_KEYS: Record<LuminosityLevel, string> = {
  1: 'lowLight',
  2: 'medium',
  3: 'brightIndirect',
  4: 'directLight',
  5: 'fullSun',
}

interface LuxOverlayProps {
  readonly level: number
  readonly lux: number
}

export function LuxOverlay({ level, lux }: LuxOverlayProps) {
  const { t } = useTranslation('addPlant')

  if (lux <= 0) return null

  const safeLevel = (level >= 1 && level <= 5 ? level : 3) as LuminosityLevel
  const config = LEVEL_CONFIG[safeLevel]
  const label = t(`scanner.luxLevels.${LEVEL_KEYS[safeLevel]}`)
  const displayLux = Math.round(lux)

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
    >
      <View
        className="flex-row items-center rounded-full px-3 py-1.5"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <MaterialIcons name={config.icon} size={16} color={config.color} />
        <Text
          className="text-xs text-white ml-1.5"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {label}
        </Text>
        <Text
          className="text-xs ml-1"
          style={{
            fontFamily: 'SpaceGrotesk_400Regular',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {displayLux} lux
        </Text>
      </View>
    </Animated.View>
  )
}
