import { Array, pipe } from 'effect'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { MonthGroupHeader } from '@/screens/plant-detail/components/MonthGroupHeader'
import type { PhotoGroup } from '@/screens/plant-detail/growthJournalGrouping'

interface GrowthJournalTimelineProps {
  groups: ReadonlyArray<PhotoGroup>
  onPhotoPress: (photoId: string) => void
}

// Horizontal screen padding applied by the journal ScrollView (px-4 → 16 each side).
const SCREEN_PADDING = 16
// Gap between grid tiles.
const TILE_GAP = 8
const COLUMNS = 3

/**
 * Renders a plant's photos as a vertical timeline of month groups, each laid
 * out as a 3-column square grid. Tapping a tile opens the full-screen viewer.
 */
export function GrowthJournalTimeline({
  groups,
  onPhotoPress,
}: GrowthJournalTimelineProps) {
  const { width } = useWindowDimensions()
  const tileSize =
    (width - SCREEN_PADDING * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS

  return (
    <View>
      {pipe(
        groups,
        Array.map((group) => (
          <View key={group.key} className="mb-8">
            <MonthGroupHeader label={group.label} count={group.photos.length} />
            <View className="flex-row flex-wrap" style={{ gap: TILE_GAP }}>
              {pipe(
                group.photos,
                Array.map((photo) => (
                  <Pressable
                    key={photo.id}
                    onPress={() => onPhotoPress(photo.id)}
                    className="active:opacity-80"
                    style={{ width: tileSize, height: tileSize }}
                    testID={`journal-photo-${photo.id}`}
                  >
                    <AnimatedImage
                      source={{ uri: photo.url }}
                      className="w-full h-full rounded-2xl"
                    />
                  </Pressable>
                ))
              )}
            </View>
          </View>
        ))
      )}
    </View>
  )
}
