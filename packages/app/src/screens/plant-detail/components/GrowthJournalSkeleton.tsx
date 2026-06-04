import { Array, pipe } from 'effect'
import { useWindowDimensions, View } from 'react-native'
import { SkeletonBox } from '@/components/skeletons'

const SCREEN_PADDING = 16
const TILE_GAP = 8
const COLUMNS = 3
const PLACEHOLDER_TILES = [0, 1, 2, 3, 4, 5]

/**
 * Loading placeholder for the Growth Journal — one faux month header plus a
 * 3-column grid of square tiles, mirroring GrowthJournalTimeline's layout.
 */
export function GrowthJournalSkeleton() {
  const { width } = useWindowDimensions()
  const tileSize =
    (width - SCREEN_PADDING * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS

  return (
    <View testID="growth-journal-skeleton">
      <View className="flex-row items-baseline justify-between mb-4">
        <SkeletonBox width={120} height={24} rounded="sm" />
        <SkeletonBox width={64} height={16} rounded="sm" />
      </View>
      <View className="flex-row flex-wrap" style={{ gap: TILE_GAP }}>
        {pipe(
          PLACEHOLDER_TILES,
          Array.map((i) => (
            <SkeletonBox
              key={i}
              width={tileSize}
              height={tileSize}
              rounded="2xl"
            />
          ))
        )}
      </View>
    </View>
  )
}
