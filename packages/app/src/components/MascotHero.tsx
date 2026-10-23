import type { ReactNode } from 'react'
import { Dimensions, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import type { MascotAnimation } from '@/assets/mascot'
import { Mascot } from '@/components/Mascot'

const { height } = Dimensions.get('window')

/**
 * One mascot size and position for every auth, welcome and onboarding screen,
 * so the plant stays in place when screens crossfade. Both scale with screen
 * height so short phones (iPhone SE) still fit the bottom card.
 */
export const HERO_MASCOT_SIZE = Math.round(
  Math.min(220, Math.max(150, height * 0.25))
)
/** Gap between the top safe area and the mascot. */
export const HERO_MASCOT_TOP = Math.round(height * 0.05)

interface MascotHeroProps {
  animation: MascotAnimation
  /** Replaces the single Mascot, e.g. two mascots crossfading. */
  mascot?: ReactNode
  title: string
  subtitle?: string
  /** Extra content under the subtitle, e.g. a preview card. */
  children?: ReactNode
}

/** Top of the auth and onboarding screens: mascot anchored at a fixed spot, then title and subtitle. */
export function MascotHero({
  animation,
  mascot,
  title,
  subtitle,
  children,
}: MascotHeroProps) {
  return (
    <View
      className="flex-1 items-center px-6"
      style={{ paddingTop: HERO_MASCOT_TOP }}
    >
      {mascot ?? <Mascot animation={animation} size={HERO_MASCOT_SIZE} />}
      {/* Keyed on the title so a screen that changes state (verify) fades
          its new text in instead of swapping it in place. */}
      <Animated.View
        key={title}
        entering={FadeIn.duration(350)}
        className="items-center"
      >
        <Text
          className="text-3xl text-white text-center mt-2"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            className="text-base text-white/75 text-center leading-relaxed max-w-[300px] mt-3"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {subtitle}
          </Text>
        )}
      </Animated.View>
      {children}
    </View>
  )
}
