import { View } from 'react-native'
import type { MascotAnimation } from '@/assets/mascot'
import { Mascot } from '@/components'
import { HERO_MASCOT_SIZE } from '@/components/MascotHero'

interface SlideMascotProps {
  animation: MascotAnimation
  /** False keeps the space but skips decoding a video nobody can see. */
  mounted: boolean
}

export function SlideMascot({ animation, mounted }: SlideMascotProps) {
  return mounted ? (
    <Mascot animation={animation} size={HERO_MASCOT_SIZE} />
  ) : (
    <View style={{ width: HERO_MASCOT_SIZE, height: HERO_MASCOT_SIZE }} />
  )
}
