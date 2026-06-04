import { MaterialIcons } from '@expo/vector-icons'
import type { PlantPhoto } from '@lily/shared'
import { Array, Option, Order, pipe } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedImage } from '@/components/AnimatedImage'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { useDeletePhoto } from '@/hooks/useDeletePhoto'
import { useIconColors } from '@/hooks/useIconColors'
import { PhotoCarouselDots } from '@/screens/plant-detail/components/PhotoCarouselDots'
import { useEffectQuery } from '@/utils/client'
import { PHOTOS_LIMIT, PHOTOS_PAGE } from '@/utils/plant-cache'

// Newest photo first — matches the entry card and Growth Journal ordering.
const photoRecentFirst: Order.Order<PlantPhoto> = Order.mapInput(
  Order.reverse(Order.number),
  (photo) => photo.takenAt.getTime()
)

export function PhotoViewerScreen() {
  const { t } = useTranslation(['plantDetail', 'common'])
  const iconColors = useIconColors()
  const { plantId, photoId } = useLocalSearchParams<{
    plantId: string
    photoId: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Page through ALL of the plant's photos (the journal's source of truth),
  // not the detail's capped subset, so the carousel spans every picture.
  const { data, isLoading } = useEffectQuery('plants', 'getPlantPhotos', {
    path: { id: Option.getOrElse(Option.fromNullable(plantId), () => '') },
    urlParams: { page: PHOTOS_PAGE, limit: PHOTOS_LIMIT },
  })

  const deletePhoto = useDeletePhoto()

  const photos = useMemo(
    () =>
      pipe(
        Option.fromNullable(data?.items),
        Option.map((items) => Array.sort(items, photoRecentFirst)),
        Option.getOrElse(() => [] as ReadonlyArray<PlantPhoto>)
      ),
    [data?.items]
  )

  // Open on the tapped photo.
  const initialIndex = useMemo(
    () =>
      pipe(
        Array.findFirstIndex(photos, (p) => p.id === photoId),
        Option.getOrElse(() => 0)
      ),
    [photos, photoId]
  )

  const flatListRef = useRef<Animated.FlatList<PlantPhoto>>(null)
  const [hasSeeded, setHasSeeded] = useState(false)
  const prevLengthRef = useRef(0)

  // The scroll offset is the single source of truth: it drives the dots
  // (continuously, so they slide rather than snap) and the delete target.
  const scrollX = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
    },
  })

  // Seed the scroll position from the deep-linked photo, and reveal the dots,
  // once data arrives (gating the dots avoids a one-frame wrong active dot).
  useEffect(() => {
    if (!hasSeeded && photos.length > 0) {
      setHasSeeded(true)
      if (width > 0) {
        scrollX.value = width * initialIndex
      }
    }
  }, [hasSeeded, photos.length, initialIndex, width, scrollX])

  // When the list shrinks after a delete, re-align the FlatList scroll offset
  // and the dots' scroll value (state alone can't move a paged list, and a
  // programmatic scroll may not emit a scroll event).
  useEffect(() => {
    const prevLength = prevLengthRef.current
    prevLengthRef.current = photos.length
    if (photos.length > 0 && photos.length < prevLength && width > 0) {
      const target = Math.min(
        Math.round(scrollX.value / width),
        photos.length - 1
      )
      flatListRef.current?.scrollToOffset({
        offset: width * target,
        animated: false,
      })
      scrollX.value = width * target
    }
  }, [photos.length, width, scrollX])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    // Target the centered slide via the live scroll position so it always
    // matches the visible photo and the dots, even mid-momentum. Fall back to
    // the deep-linked index before the first scroll has settled.
    const index =
      hasSeeded && width > 0 ? Math.round(scrollX.value / width) : initialIndex
    const current = pipe(Array.get(photos, index), Option.getOrNull)
    if (!plantId || !current) return

    const wasLast = photos.length <= 1
    // Optimistic: the photo vanishes from the caches immediately (onMutate).
    deletePhoto.mutate({ path: { id: plantId, photoId: current.id } })
    setShowDeleteConfirm(false)
    if (wasLast) router.back()
  }, [
    photos,
    hasSeeded,
    initialIndex,
    width,
    scrollX,
    plantId,
    deletePhoto,
    router,
  ])

  const renderItem = useCallback(
    ({ item }: { item: PlantPhoto }) => (
      <View
        style={{ width }}
        className="h-full"
        testID={`photo-viewer-slide-${item.id}`}
      >
        <AnimatedImage
          source={{ uri: item.url }}
          className="flex-1"
          contentFit="contain"
        />
      </View>
    ),
    [width]
  )

  if (isLoading && !data) {
    return (
      <View
        className="flex-1 bg-black items-center justify-center"
        testID="photo-viewer-loading"
      >
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )
  }

  if (Array.isEmptyReadonlyArray(photos)) {
    return (
      <View
        className="flex-1 bg-black items-center justify-center"
        testID="photo-viewer-error"
      >
        <MaterialIcons
          name="broken-image"
          size={48}
          color={iconColors.textMuted}
        />
        <Text className="text-white mt-4 font-medium">
          {t('plantDetail:photoViewer.photoNotFound')}
        </Text>
        <Pressable
          onPress={handleBack}
          className="mt-6 px-6 py-3 rounded-full bg-white/20"
        >
          <Text className="text-white font-semibold">
            {t('common:buttons.goBack')}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-black" testID="photo-viewer-screen">
      {/* Swipeable carousel of all photos */}
      <Animated.FlatList
        ref={flatListRef}
        data={photos}
        keyExtractor={(photo) => photo.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollToIndexFailed={(info) => {
          // getItemLayout makes this rare, but guard against a thrown invariant.
          flatListRef.current?.scrollToOffset({
            offset: width * info.index,
            animated: false,
          })
        }}
        testID="photo-viewer-carousel"
      />

      {/* Header with back and delete buttons */}
      <View
        className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top + 8 }}
        testID="photo-viewer-header"
      >
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full items-center justify-center bg-black/50"
          testID="photo-viewer-back-button"
        >
          <MaterialIcons name="close" size={24} color="white" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="w-10 h-10 rounded-full items-center justify-center bg-black/50"
          testID="photo-viewer-delete-button"
        >
          <MaterialIcons name="delete" size={24} color={iconColors.coral} />
        </Pressable>
      </View>

      {/* Pagination dots (interpolated from scroll position) */}
      {hasSeeded && photos.length > 1 && (
        <View
          className="absolute left-0 right-0 items-center"
          style={{ bottom: insets.bottom + 24 }}
        >
          <PhotoCarouselDots
            count={photos.length}
            scrollX={scrollX}
            width={width}
            testID="photo-viewer-dots"
          />
        </View>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t('plantDetail:photoViewer.deleteTitle')}
        message={t('plantDetail:photoViewer.deleteMessage')}
        confirmLabel={t('plantDetail:photoViewer.deleteConfirm')}
        cancelLabel={t('plantDetail:photoViewer.deleteCancel')}
        destructive
        icon={
          <MaterialIcons name="delete" size={32} color={iconColors.coral} />
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </View>
  )
}
