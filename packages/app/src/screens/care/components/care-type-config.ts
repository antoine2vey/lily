import type { MaterialIcons } from '@expo/vector-icons'
import type { CareType } from '@lily/shared'
import { Match, pipe } from 'effect'
import type { useIconColors } from '@/hooks/useIconColors'

export interface CareTypeConfig {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  labelKey: CareType
}

/** Icon + colour for each schedule-backed care type, shared by task and plan cards. */
export const getCareTypeConfig = (
  type: CareType,
  iconColors: ReturnType<typeof useIconColors>
): CareTypeConfig =>
  pipe(
    Match.value(type),
    Match.when('watering', () => ({
      icon: 'water-drop' as const,
      color: iconColors.waterBlue,
      labelKey: 'watering' as const,
    })),
    Match.when('fertilization', () => ({
      icon: 'eco' as const,
      color: iconColors.fertilizerOrange,
      labelKey: 'fertilization' as const,
    })),
    Match.when('misting', () => ({
      icon: 'grain' as const,
      color: iconColors.waterBlue,
      labelKey: 'misting' as const,
    })),
    Match.when('repotting', () => ({
      icon: 'compost' as const,
      color: iconColors.repotBrown,
      labelKey: 'repotting' as const,
    })),
    Match.exhaustive
  )
