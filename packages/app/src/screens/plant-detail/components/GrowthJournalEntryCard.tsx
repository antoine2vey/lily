import { MaterialIcons } from '@expo/vector-icons'
import { Array, Order, pipe } from 'effect'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { PhotoSourceSheet } from '@/components/PhotoSourceSheet'
import { useIconColors } from '@/hooks/useIconColors'
import { buildGrowingForLabel } from '@/screens/plant-detail/plantAge'

interface JournalEntryPhoto {
  id: string
  url: string
  createdAt: Date
}

interface GrowthJournalEntryCardProps {
  photos: ReadonlyArray<JournalEntryPhoto>
  plantDateAdded: Date
  /** Total photo count across all pages (may exceed `photos.length`). */
  totalCount: number
  onPhotoPress: (photoId: string) => void
  onPhoto: (uri: string) => void
  onViewJournal: () => void
}

// Cap thumbnails rendered in the (non-virtualized) horizontal scroll; the full
// set lives behind "View all". Sized so ~3.35 tiles show — the tip of the 4th
// peeks to invite scrolling.
const PREVIEW_CAP = 12
const H_SCREEN_PADDING = 24 // PlantDetailScreen content px-6
const TILE_GAP = 8
const VISIBLE_TILES = 3.35

// Most-recent photo first.
const recentFirst: Order.Order<JournalEntryPhoto> = Order.mapInput(
  Order.reverse(Order.number),
  (photo) => photo.createdAt.getTime()
)

/**
 * Entry point for the Growth Journal on the plant detail screen. Sits flat on
 * the screen (no card chrome) like the sibling sections: shows the plant's age
 * and a horizontally scrollable strip of fixed-size square thumbnails (the tip
 * of the next one peeks to invite scrolling), plus an always-present add
 * affordance.
 */
export function GrowthJournalEntryCard({
  photos,
  plantDateAdded,
  totalCount,
  onPhotoPress,
  onPhoto,
  onViewJournal,
}: GrowthJournalEntryCardProps) {
  const { t } = useTranslation('plantDetail')
  const iconColors = useIconColors()
  const { width } = useWindowDimensions()
  const [showPicker, setShowPicker] = useState(false)

  const handleOpenPicker = useCallback(() => setShowPicker(true), [])
  const handleClosePicker = useCallback(() => setShowPicker(false), [])

  const growingFor = buildGrowingForLabel(plantDateAdded, t)

  // Fixed square tile size: the track fits ~3.35 tiles so the fourth peeks.
  // trackWidth = screen − screen padding.
  const tileSize = (width - H_SCREEN_PADDING * 2 - TILE_GAP * 2) / VISIBLE_TILES

  const previewPhotos = pipe(
    photos,
    Array.sort(recentFirst),
    Array.take(PREVIEW_CAP)
  )
  const hasPhotos = !Array.isEmptyReadonlyArray(previewPhotos)

  return (
    <View testID="growth-journal-entry-card">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('gallery.journalTitle')}
        </Text>
        {hasPhotos && (
          <Pressable
            onPress={onViewJournal}
            className="flex-row items-center active:opacity-70"
            testID="growth-journal-view-all"
          >
            <Text className="text-sm font-semibold text-primary dark:text-primary-light mr-0.5">
              {t('gallery.viewAll')}
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color={iconColors.primary}
            />
          </Pressable>
        )}
      </View>

      {/* Age pill */}
      <View className="self-start mb-4 rounded-full bg-primary-tint dark:bg-primary/15 px-3 py-1">
        <Text className="text-xs font-semibold text-primary-dark dark:text-primary-light">
          {`🌱 ${growingFor}${
            totalCount > 0
              ? ` · ${t('gallery.photoCountBadge', { count: totalCount })}`
              : ''
          }`}
        </Text>
      </View>

      {hasPhotos ? (
        <>
          {/* Horizontally scrollable strip of fixed-size square thumbnails */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            contentContainerStyle={{ gap: TILE_GAP }}
            testID="growth-journal-preview-scroll"
          >
            {pipe(
              previewPhotos,
              Array.map((photo) => (
                <Pressable
                  key={photo.id}
                  onPress={() => onPhotoPress(photo.id)}
                  className="active:opacity-80"
                  style={{ width: tileSize, height: tileSize }}
                  testID={`growth-journal-preview-${photo.id}`}
                >
                  <AnimatedImage
                    source={{ uri: photo.url }}
                    className="w-full h-full rounded-2xl"
                  />
                </Pressable>
              ))
            )}
          </ScrollView>

          {/* Add-photo affordance */}
          <Pressable
            onPress={handleOpenPicker}
            className="flex-row items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border dark:border-slate-600 py-3 active:bg-surface-tinted dark:active:bg-primary/10"
            testID="growth-journal-add-photo"
          >
            <MaterialIcons
              name="add-a-photo"
              size={20}
              color={iconColors.textMuted}
            />
            <Text className="text-sm font-semibold text-text-muted dark:text-slate-400">
              {t('gallery.addPhoto')}
            </Text>
          </Pressable>
        </>
      ) : (
        /* Empty state */
        <View className="items-center py-6" testID="growth-journal-empty">
          <View className="w-14 h-14 rounded-full bg-primary-tint dark:bg-primary/15 items-center justify-center mb-3">
            <MaterialIcons
              name="photo-camera"
              size={26}
              color={iconColors.primary}
            />
          </View>
          <Text className="text-base font-bold text-text-primary dark:text-white mb-1">
            {t('gallery.noPhotosTitle')}
          </Text>
          <Text className="text-sm text-center text-text-muted dark:text-slate-400 mb-4 px-4">
            {t('gallery.noPhotosDescription')}
          </Text>
          <Pressable
            onPress={handleOpenPicker}
            className="flex-row items-center gap-2 rounded-full bg-primary active:bg-primary-dark px-5 py-2.5"
            testID="growth-journal-add-first-photo"
          >
            <MaterialIcons
              name="add-a-photo"
              size={18}
              color={iconColors.white}
            />
            <Text className="text-sm font-semibold text-white">
              {t('gallery.addFirstPhoto')}
            </Text>
          </Pressable>
        </View>
      )}

      <PhotoSourceSheet
        visible={showPicker}
        onClose={handleClosePicker}
        onPhoto={onPhoto}
      />
    </View>
  )
}
