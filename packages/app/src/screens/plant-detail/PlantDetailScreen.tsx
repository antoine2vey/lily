import { MaterialIcons } from '@expo/vector-icons'
import {
  type CareType,
  daysUntilApiDate,
  formatApiDateAsNextDate,
  getFrequencyDays,
  getLastCareAt,
  getNextCareAt,
} from '@lily/shared'
import { Array, Either, Match, Option, pipe } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Image, Pressable, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { captureRef } from 'react-native-view-shot'
import { toast } from 'sonner-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { useCarePlant } from '@/hooks/useCarePlant'
import { useCreateConversation } from '@/hooks/useCreateConversation'
import { useDeletePlant } from '@/hooks/useDeletePlant'
import { useIconColors } from '@/hooks/useIconColors'
import { usePlant } from '@/hooks/usePlant'
import { useSharePlant } from '@/hooks/useSharePlant'
import { useTheme } from '@/hooks/useTheme'
import { useUpdatePlant } from '@/hooks/useUpdatePlant'
import { useUploadPhoto } from '@/hooks/useUploadPhoto'
import { CareSchedule } from '@/screens/plant-detail/components/CareSchedule'
import { ChatCTA } from '@/screens/plant-detail/components/ChatCTA'
import { CorrectCareDatesSheet } from '@/screens/plant-detail/components/CorrectCareDatesSheet'
import { GallerySection } from '@/screens/plant-detail/components/GallerySection'
import { IdealEnvironment } from '@/screens/plant-detail/components/IdealEnvironment'
import { PastCareSheet } from '@/screens/plant-detail/components/PastCareSheet'
import { PlantHeader } from '@/screens/plant-detail/components/PlantHeader'
import { PlantOptionsSheet } from '@/screens/plant-detail/components/PlantOptionsSheet'
import { PlantShareCard } from '@/screens/plant-detail/components/PlantShareCard'
import { RecentHistory } from '@/screens/plant-detail/components/RecentHistory'
import { useEffectQuery } from '@/utils/client'
import { mapApiHealthToCardHealth } from '@/utils/health'

const CARE_TOAST_KEYS: Readonly<
  globalThis.Record<CareType, { success: string; error: string }>
> = {
  watering: {
    success: 'detail.toast.watered',
    error: 'detail.toast.waterFailed',
  },
  fertilization: {
    success: 'detail.toast.fertilized',
    error: 'detail.toast.fertilizeFailed',
  },
  misting: {
    success: 'detail.toast.misted',
    error: 'detail.toast.mistFailed',
  },
  repotting: {
    success: 'detail.toast.repotted',
    error: 'detail.toast.repotFailed',
  },
}

const HERO_HEIGHT = Dimensions.get('window').height * 0.45

function PlantDetailSkeleton() {
  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      testID="plant-detail-skeleton"
    >
      <SkeletonBox width="100%" height={HERO_HEIGHT} rounded="none" />
      <View
        className="bg-background dark:bg-background-dark px-6 pb-8 -mt-12"
        style={{ borderTopLeftRadius: 40, borderTopRightRadius: 40 }}
      >
        <View className="w-12 h-1.5 bg-border dark:bg-slate-600 rounded-full mx-auto mt-4 mb-6 opacity-50" />
        <SkeletonBox width="70%" height={24} rounded="sm" />
        <View className="mt-2">
          <SkeletonBox width="40%" height={14} rounded="sm" />
        </View>
        <View className="mt-8">
          <SkeletonBox width="100%" height={80} rounded="lg" />
        </View>
        <View className="mt-10 flex-row gap-4">
          <View className="flex-1">
            <SkeletonBox width="100%" height={100} rounded="lg" />
          </View>
          <View className="flex-1">
            <SkeletonBox width="100%" height={100} rounded="lg" />
          </View>
        </View>
        <View className="mt-10">
          <SkeletonBox width={120} height={20} rounded="sm" />
          <View className="mt-3 flex-row gap-3">
            {Array.map([1, 2, 3], (i) => (
              <View key={i} className="items-center gap-2">
                <SkeletonCircle size={48} />
                <SkeletonBox width={48} height={12} rounded="sm" />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}

interface ErrorStateProps {
  onRetry: () => void
}

function ErrorState({ onRetry }: ErrorStateProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark items-center justify-center p-6"
      testID="plant-detail-error"
    >
      <MaterialIcons name="error-outline" size={48} color={iconColors.coral} />
      <Text className="text-lg text-center mt-4 font-semibold text-text-primary dark:text-white">
        {t('detail.error.loadFailed')}
      </Text>
      <Text className="text-sm text-center mt-2 font-regular text-text-muted dark:text-slate-400">
        {t('detail.error.loadFailedMessage')}
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-6 px-6 py-3 rounded-full bg-primary"
      >
        <Text className="font-semibold text-white">
          {t('detail.error.tryAgain')}
        </Text>
      </Pressable>
    </View>
  )
}

interface PlantHeroImageProps {
  imageUrl?: string | null
}

function PlantHeroImage({ imageUrl }: PlantHeroImageProps) {
  const iconColors = useIconColors()
  if (!imageUrl) {
    return (
      <View
        style={{ height: HERO_HEIGHT }}
        className="items-center justify-center bg-primary-tint dark:bg-primary/20"
        testID="plant-hero-placeholder"
      >
        <MaterialIcons
          name="local-florist"
          size={80}
          color={iconColors.primary}
        />
      </View>
    )
  }

  return (
    <AnimatedImage
      source={{ uri: imageUrl }}
      style={{ height: HERO_HEIGHT }}
      className="w-full"
    />
  )
}

export function PlantDetailScreen() {
  const { t } = useTranslation('plants')
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { isDark } = useTheme()

  const [showOptionsSheet, setShowOptionsSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activePastCareType, setActivePastCareType] = useState<CareType | null>(
    null
  )
  const [showCorrectDatesSheet, setShowCorrectDatesSheet] = useState(false)

  // Scroll tracking for header animation
  const scrollY = useSharedValue(0)
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  // Calculate when card reaches the top (accounting for header area)
  const cardTopThreshold = HERO_HEIGHT - 48 - insets.top - 60

  // Animated style for header button backgrounds
  const animatedButtonStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      scrollY.value,
      [0, cardTopThreshold],
      isDark
        ? ['rgba(30,41,59,0.4)', 'rgba(30,41,59,0.95)'] // slate-800
        : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.95)']
    )
    return { backgroundColor }
  })

  const {
    data: plant,
    isLoading,
    error,
    refetch,
  } = usePlant(Option.getOrElse(Option.fromNullable(plantId), () => ''))

  const { data: careLogs } = useEffectQuery('careLogs', 'getCareLogs', {
    path: {
      plantId: Option.getOrElse(Option.fromNullable(plantId), () => ''),
    },
    urlParams: { page: '1', limit: '3', type: 'all' },
  })

  const shareCardRef = useRef<View>(null)

  const uploadPhoto = useUploadPhoto()
  const carePlant = useCarePlant()
  const sharePlant = useSharePlant()
  const updatePlant = useUpdatePlant()
  const deletePlant = useDeletePlant()
  const createConversation = useCreateConversation()

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleMoreOptions = useCallback(() => {
    setShowOptionsSheet(true)
  }, [])

  const handleChat = useCallback(async () => {
    if (!plantId) return
    const result = await createConversation.mutateAsync({
      payload: { kind: 'plant', plantId },
    })
    Either.match(result, {
      onLeft: () => undefined,
      onRight: (created) => router.push(`/chat/${created.id}` as never),
    })
  }, [plantId, router, createConversation])

  const handleCareNow = useCallback(
    (careType: CareType) => {
      if (!plantId) return
      const keys = CARE_TOAST_KEYS[careType]
      carePlant.mutate(
        { path: { id: plantId }, payload: { careType } },
        {
          onSuccess: () =>
            toast.success(t(keys.success, { name: plant?.name })),
          onError: () => toast.error(t(keys.error)),
        }
      )
    },
    [plantId, plant?.name, carePlant, t]
  )

  const handleWaterNow = useCallback(
    () => handleCareNow('watering'),
    [handleCareNow]
  )
  const handleFertilizeNow = useCallback(
    () => handleCareNow('fertilization'),
    [handleCareNow]
  )
  const handleMistNow = useCallback(
    () => handleCareNow('misting'),
    [handleCareNow]
  )
  const handleRepotNow = useCallback(
    () => handleCareNow('repotting'),
    [handleCareNow]
  )

  const handleWaterPast = useCallback(() => {
    setActivePastCareType('watering')
  }, [])
  const handleFertilizePast = useCallback(() => {
    setActivePastCareType('fertilization')
  }, [])
  const handleMistPast = useCallback(() => {
    setActivePastCareType('misting')
  }, [])
  const handleRepotPast = useCallback(() => {
    setActivePastCareType('repotting')
  }, [])

  const handlePastCareSelect = useCallback(
    (date: Date) => {
      if (!plantId || !activePastCareType) return
      const keys = CARE_TOAST_KEYS[activePastCareType]
      carePlant.mutate(
        {
          path: { id: plantId },
          payload: { careType: activePastCareType, date },
        },
        {
          onSuccess: () =>
            toast.success(t(keys.success, { name: plant?.name })),
          onError: () => toast.error(t(keys.error)),
        }
      )
    },
    [plantId, plant?.name, activePastCareType, carePlant, t]
  )

  const handleCorrectDates = useCallback(() => {
    setShowCorrectDatesSheet(true)
  }, [])

  const handleEditSchedule = useCallback(() => {
    router.push(`/plant/${plantId}/edit`)
  }, [plantId, router])

  const handlePhotoPress = useCallback(
    (photoId: string) => {
      router.push(`/plant/${plantId}/photo/${photoId}`)
    },
    [router, plantId]
  )

  const handlePhoto = useCallback(
    (uri: string) => {
      if (!plantId) return
      uploadPhoto.mutate({ plantId, photoUri: uri })
    },
    [plantId, uploadPhoto]
  )

  const handleViewAllHistory = useCallback(() => {
    router.push(`/plant/${plantId}/care-history`)
  }, [plantId, router])

  const handleEdit = useCallback(() => {
    router.push(`/plant/${plantId}/edit`)
  }, [plantId, router])

  const handleToggleFavorite = useCallback(() => {
    if (!plantId || !plant) return
    updatePlant.mutate(
      { path: { id: plantId }, payload: { isFavorite: !plant.isFavorite } },
      {
        onSuccess: () => {
          toast.success(
            plant.isFavorite
              ? t('detail.toast.removedFromFavorites', { name: plant.name })
              : t('detail.toast.addedToFavorites', { name: plant.name })
          )
        },
        onError: () => toast.error(t('detail.toast.favoriteFailed')),
      }
    )
  }, [plantId, plant, updatePlant, t])

  const handleShare = useCallback(async () => {
    if (!plant || !plantId) return
    try {
      // Prefetch the plant image so it's rendered before capture
      if (plant.imageUrl) {
        await Image.prefetch(plant.imageUrl)
      }
      // Small delay to let the image render into the off-screen view
      await new Promise((resolve) => setTimeout(resolve, 100))
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
      })
      await Sharing.shareAsync(uri, { mimeType: 'image/png' })
      // Fire-and-forget: notify backend for SHARE_SPROUT achievement
      sharePlant.mutate({ path: { id: plantId } })
    } catch {
      // User cancelled or capture failed — no action needed
    }
  }, [plant, plantId, sharePlant])

  const handleDelete = useCallback(() => {
    setShowOptionsSheet(false)
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!plantId) return
    deletePlant.mutate(
      { path: { id: plantId } },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          toast.success(t('detail.toast.deleted', { name: plant?.name }))
          router.back()
        },
        onError: () => {
          setShowDeleteConfirm(false)
          toast.error(t('detail.toast.deleteFailed'))
        },
      }
    )
  }, [plantId, plant?.name, deletePlant, router, t])

  // Extract schedule data — memoized since this screen re-renders on scroll
  const scheduleData = useMemo(() => {
    if (!plant) return null
    const schedules = plant.schedules
    const nextWaterAt = getNextCareAt(schedules, 'watering')
    const nextFertAt = getNextCareAt(schedules, 'fertilization')
    const nextMistAt = getNextCareAt(schedules, 'misting')
    const nextRepotAt = getNextCareAt(schedules, 'repotting')
    const lastWaterAt = getLastCareAt(schedules, 'watering')
    const lastFertAt = getLastCareAt(schedules, 'fertilization')
    const lastMistAt = getLastCareAt(schedules, 'misting')
    const lastRepotAt = getLastCareAt(schedules, 'repotting')
    const hasFertSchedule =
      getFrequencyDays(schedules, 'fertilization') !== null
    const hasMistSchedule = getFrequencyDays(schedules, 'misting') !== null
    const hasRepotSchedule = getFrequencyDays(schedules, 'repotting') !== null

    return {
      nextWaterAt,
      nextFertAt,
      nextMistAt,
      nextRepotAt,
      lastWaterAt,
      lastFertAt,
      lastMistAt,
      lastRepotAt,
      hasFertSchedule,
      hasMistSchedule,
      hasRepotSchedule,
      daysUntilWater: daysUntilApiDate(nextWaterAt),
      daysUntilFertilize: hasFertSchedule ? daysUntilApiDate(nextFertAt) : null,
      daysUntilMist: hasMistSchedule ? daysUntilApiDate(nextMistAt) : null,
      daysUntilRepot: hasRepotSchedule ? daysUntilApiDate(nextRepotAt) : null,
      isWaterFirstTime: lastWaterAt === null,
      isFertilizeFirstTime: hasFertSchedule && lastFertAt === null,
      isMistFirstTime: hasMistSchedule && lastMistAt === null,
      isRepotFirstTime: hasRepotSchedule && lastRepotAt === null,
      hasAnyCareHistory:
        lastWaterAt !== null ||
        lastFertAt !== null ||
        lastMistAt !== null ||
        lastRepotAt !== null,
    }
  }, [plant])

  if (isLoading && !plant) {
    return <PlantDetailSkeleton />
  }

  if (error || !plant || !scheduleData) {
    return <ErrorState onRetry={refetch} />
  }

  const healthStatus = mapApiHealthToCardHealth(plant.health)

  // Map photos from plant data
  const photos = Array.map(
    Option.getOrElse(Option.fromNullable(plant.photos), () => []),
    (photo) => ({
      id: photo.id,
      url: photo.url,
      createdAt: photo.takenAt,
    })
  )

  const historyEvents = pipe(
    Option.fromNullable(careLogs?.items),
    Option.map(
      Array.map((log) => ({
        id: log.id,
        type: pipe(
          Match.value(log.type),
          Match.when('watering', () => 'watered' as const),
          Match.when('fertilization', () => 'fertilized' as const),
          Match.when('misting', () => 'misted' as const),
          Match.when('repotting', () => 'repotted' as const),
          Match.exhaustive
        ),
        date: log.date,
      }))
    ),
    Option.getOrElse(
      () =>
        [] as {
          id: string
          type: 'watered' | 'fertilized' | 'misted' | 'repotted'
          date: Date
          notes?: string
        }[]
    )
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      testID="plant-detail-screen"
    >
      {/* Fixed Hero Image */}
      <View className="absolute top-0 left-0 right-0">
        <PlantHeroImage imageUrl={plant.imageUrl} />
      </View>

      {/* Scrollable Content Card */}
      <Animated.ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        testID="plant-detail-scroll"
        contentContainerStyle={{ paddingTop: HERO_HEIGHT - 48 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Content card with overlap */}
        <View
          className="bg-background dark:bg-background-dark px-6 pb-8"
          style={{
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            minHeight: Dimensions.get('window').height - HERO_HEIGHT + 100,
          }}
          testID="plant-detail-content"
        >
          {/* Drag Handle */}
          <View className="w-12 h-1.5 bg-border dark:bg-slate-600 rounded-full mx-auto mt-4 mb-6 opacity-50" />

          {/* Plant Header */}
          <PlantHeader
            plant={{
              name: plant.name,
              category: Option.getOrUndefined(
                Option.fromNullable(plant.category)
              ),
              health: healthStatus,
              potWidthCm: plant.potWidthCm,
              potHeightCm: plant.potHeightCm,
            }}
          />

          {/* Room Badge */}
          {plant.room && (
            <View className="flex-row items-center gap-1.5 mt-2 px-3 py-1.5 self-start bg-surface-tinted dark:bg-slate-800 rounded-full">
              <Text className="text-sm">{plant.room.icon}</Text>
              <Text className="text-sm font-medium text-text-secondary dark:text-slate-300">
                {plant.room.name}
              </Text>
            </View>
          )}

          {/* Chat CTA */}
          <View className="mt-8">
            <ChatCTA plantName={plant.name} onPress={handleChat} />
          </View>

          {/* Care Schedule */}
          <View className="mt-10">
            <CareSchedule
              wateringDays={scheduleData.daysUntilWater}
              wateringDate={formatApiDateAsNextDate(scheduleData.nextWaterAt)}
              fertilizingDays={scheduleData.daysUntilFertilize}
              fertilizingDate={formatApiDateAsNextDate(scheduleData.nextFertAt)}
              mistingDays={scheduleData.daysUntilMist}
              mistingDate={formatApiDateAsNextDate(scheduleData.nextMistAt)}
              repottingDays={scheduleData.daysUntilRepot}
              repottingDate={formatApiDateAsNextDate(scheduleData.nextRepotAt)}
              onEdit={handleEditSchedule}
              onWaterNow={handleWaterNow}
              onFertilizeNow={handleFertilizeNow}
              onMistNow={handleMistNow}
              onRepotNow={handleRepotNow}
              onWaterPast={handleWaterPast}
              onFertilizePast={handleFertilizePast}
              onMistPast={handleMistPast}
              onRepotPast={handleRepotPast}
              isWaterFirstTime={scheduleData.isWaterFirstTime}
              isFertilizeFirstTime={scheduleData.isFertilizeFirstTime}
              isMistFirstTime={scheduleData.isMistFirstTime}
              isRepotFirstTime={scheduleData.isRepotFirstTime}
              onCorrectDates={
                scheduleData.hasAnyCareHistory ? handleCorrectDates : undefined
              }
            />
          </View>

          {/* Ideal Environment */}
          <View className="mt-10">
            <IdealEnvironment
              sunlightPercentage={plant.lightingRating}
              waterPercentage={plant.wateringRating}
              humidityPercentage={plant.humidityRating}
            />
          </View>

          {/* Gallery */}
          <View className="mt-10">
            <GallerySection
              photos={photos}
              onPhotoPress={handlePhotoPress}
              onPhoto={handlePhoto}
            />
          </View>

          {/* Recent History */}
          <View className="mt-10 mb-4">
            <RecentHistory
              events={historyEvents}
              onViewAll={handleViewAllHistory}
            />
          </View>
        </View>
      </Animated.ScrollView>

      {/* Floating Header */}
      <View
        className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top + 8 }}
        testID="plant-detail-header"
      >
        <Pressable onPress={handleBack} testID="back-button">
          <Animated.View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={animatedButtonStyle}
          >
            <MaterialIcons
              name="arrow-back"
              size={24}
              color={iconColors.textPrimary}
            />
          </Animated.View>
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable onPress={handleToggleFavorite}>
            <Animated.View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={animatedButtonStyle}
            >
              <MaterialIcons
                name={plant.isFavorite ? 'favorite' : 'favorite-border'}
                size={24}
                color={iconColors.textPrimary}
              />
            </Animated.View>
          </Pressable>
          <Pressable onPress={handleMoreOptions} testID="more-options-button">
            <Animated.View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={animatedButtonStyle}
            >
              <MaterialIcons
                name="more-vert"
                size={24}
                color={iconColors.textPrimary}
              />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* Options Sheet */}
      <PlantOptionsSheet
        visible={showOptionsSheet}
        onClose={() => setShowOptionsSheet(false)}
        plantName={plant.name}
        isFavorite={plant.isFavorite}
        onEdit={handleEdit}
        onToggleFavorite={handleToggleFavorite}
        onShare={handleShare}
        onDelete={handleDelete}
      />

      {/* Past Care Sheet */}
      <PastCareSheet
        visible={activePastCareType !== null}
        onClose={() => setActivePastCareType(null)}
        onSelect={handlePastCareSelect}
      />

      {/* Correct Care Dates Sheet */}
      <CorrectCareDatesSheet
        visible={showCorrectDatesSheet}
        onClose={() => setShowCorrectDatesSheet(false)}
        plantId={Option.getOrElse(Option.fromNullable(plantId), () => '')}
        lastWateredAt={scheduleData.lastWaterAt}
        lastFertilizedAt={scheduleData.lastFertAt}
        hasFertilization={scheduleData.hasFertSchedule}
      />

      {/* Off-screen Share Card (captured by view-shot) */}
      <PlantShareCard
        ref={shareCardRef}
        plant={{
          name: plant.name,
          imageUrl: plant.imageUrl,
          category: plant.category,
          health: plant.health,
          dateAdded: plant.dateAdded,
          photoCount: Option.getOrElse(
            Option.map(Option.fromNullable(plant.photos), (p) => p.length),
            () => 0
          ),
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t('detail.delete.title', { name: plant.name })}
        message={t('detail.delete.message')}
        confirmLabel={t('detail.delete.confirm')}
        cancelLabel={t('detail.delete.cancel')}
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
