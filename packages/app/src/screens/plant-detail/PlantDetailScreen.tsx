import { MaterialIcons } from '@expo/vector-icons'
import {
  type CareType,
  daysUntilApiDate,
  formatApiDateAsNextDate,
  getFrequencyDays,
  getLastCareAt,
  getNextCareAt,
} from '@lily/shared'
import { Array, Match, Option, pipe, Result } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import {
  type ComponentRef,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Dimensions, Image, Pressable, Text, View } from 'react-native'
import Animated, {
  FadeIn,
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
import { GlassIconButton } from '@/components/GlassIconButton'
import { useAuth } from '@/contexts/AuthContext'
import { useCarePlant } from '@/hooks/useCarePlant'
import { useConversationByPlant } from '@/hooks/useConversationByPlant'
import { useCreateConversation } from '@/hooks/useCreateConversation'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useDeletePlant } from '@/hooks/useDeletePlant'
import { useIconColors } from '@/hooks/useIconColors'
import { useMarkPlantDead } from '@/hooks/useMarkPlantDead'
import { useMyCanopy } from '@/hooks/useMyCanopy'
import { usePlant } from '@/hooks/usePlant'
import {
  useSetPlantMuted,
  useSharePlantWithCanopy,
  useUnsharePlant,
} from '@/hooks/usePlantCanopyActions'
import { useRevivePlant } from '@/hooks/useRevivePlant'
import { useSharePlant } from '@/hooks/useSharePlant'
import { useTheme } from '@/hooks/useTheme'
import { useUpdatePlant } from '@/hooks/useUpdatePlant'
import { useUploadPhoto } from '@/hooks/useUploadPhoto'
import { CareSchedule } from '@/screens/plant-detail/components/CareSchedule'
import { ChatCTA } from '@/screens/plant-detail/components/ChatCTA'
import { CorrectCareDatesSheet } from '@/screens/plant-detail/components/CorrectCareDatesSheet'
import { GrowthJournalEntryCard } from '@/screens/plant-detail/components/GrowthJournalEntryCard'
import { IdealEnvironment } from '@/screens/plant-detail/components/IdealEnvironment'
import { MemorialBanner } from '@/screens/plant-detail/components/MemorialBanner'
import { PastCareSheet } from '@/screens/plant-detail/components/PastCareSheet'
import { PlantCarePlans } from '@/screens/plant-detail/components/PlantCarePlans'
import { PlantDetailSkeleton } from '@/screens/plant-detail/components/PlantDetailSkeleton'
import { PlantHeader } from '@/screens/plant-detail/components/PlantHeader'
import { PlantOptionsSheet } from '@/screens/plant-detail/components/PlantOptionsSheet'
import { PlantShareCard } from '@/screens/plant-detail/components/PlantShareCard'
import { RecentHistory } from '@/screens/plant-detail/components/RecentHistory'
import {
  type SayGoodbyePayload,
  SayGoodbyeSheet,
} from '@/screens/plant-detail/components/SayGoodbyeSheet'
import { actionsOnPlant, careActorFor } from '@/utils/canopy-plants'
import { useEffectQuery } from '@/utils/client'
import { useGlass } from '@/utils/glass'
import { mapApiHealthToCardHealth } from '@/utils/health'
import { showPlantLimitAlert } from '@/utils/plant-limit-alert'

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

// biome-ignore lint/suspicious/noExplicitAny: Reanimated animated style types don't satisfy exactOptionalPropertyTypes when extracted as a prop; the runtime value is a normal ViewStyle subset.
type AnimatedFallbackStyle = any

function HeaderButton({
  icon,
  onPress,
  iconColor,
  accessibilityLabel,
  testID,
  animatedFallbackStyle,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  iconColor: string
  accessibilityLabel: string
  testID?: string
  animatedFallbackStyle: AnimatedFallbackStyle
}) {
  if (useGlass) {
    return (
      <GlassIconButton
        icon={icon}
        onPress={onPress}
        iconColor={iconColor}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    )
  }

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Animated.View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={animatedFallbackStyle}
      >
        <MaterialIcons name={icon} size={24} color={iconColor} />
      </Animated.View>
    </Pressable>
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
  const { t: tCemetery } = useTranslation('cemetery')
  const { t: tCanopy } = useTranslation('canopy')
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { isDark } = useTheme()

  const [showOptionsSheet, setShowOptionsSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showGoodbyeSheet, setShowGoodbyeSheet] = useState(false)
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
  } = usePlant(Option.getOrElse(Option.fromNullishOr(plantId), () => ''))

  const { data: careLogs } = useEffectQuery('careLogs', 'getCareLogs', {
    params: {
      plantId: Option.getOrElse(Option.fromNullishOr(plantId), () => ''),
    },
    query: { page: '1', limit: '3', type: 'all' },
  })

  const shareCardRef = useRef<ComponentRef<typeof View>>(null)

  const uploadPhoto = useUploadPhoto()
  const carePlant = useCarePlant()
  const sharePlant = useSharePlant()
  const updatePlant = useUpdatePlant()
  const deletePlant = useDeletePlant()
  const markPlantDead = useMarkPlantDead()
  const revivePlant = useRevivePlant()
  const sharePlantWithCanopy = useSharePlantWithCanopy()
  const unsharePlant = useUnsharePlant()
  const setPlantMuted = useSetPlantMuted()
  const { state: authState } = useAuth()
  const me = authState._tag === 'Authenticated' ? authState.user.id : ''
  const { data: canopyData } = useMyCanopy()
  const myCanopy = Option.fromNullishOr(canopyData?.canopy)
  const createConversation = useCreateConversation()
  const { findExisting: findExistingPlantChat } =
    useConversationByPlant(plantId)

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleMoreOptions = useCallback(() => {
    setShowOptionsSheet(true)
  }, [])

  const handleChat = useCallback(async () => {
    if (!plantId) return
    const existing = await findExistingPlantChat()
    if (Option.isSome(existing)) {
      router.push(`/chat/${existing.value}` as never)
      return
    }
    const result = await createConversation.mutateAsync({
      payload: { kind: 'plant', plantId },
    })
    Result.match(result, {
      onFailure: () => undefined,
      onSuccess: (created) => router.push(`/chat/${created.id}` as never),
    })
  }, [plantId, router, createConversation, findExistingPlantChat])

  const handleCareNow = useCallback(
    (careType: CareType) => {
      if (!plantId) return
      if (carePlant.isPending) return
      const keys = CARE_TOAST_KEYS[careType]
      carePlant.mutate(
        { params: { id: plantId }, payload: { careType } },
        {
          onSuccess: () =>
            toast.success(t(keys.success, { name: plant?.name })),
          onError: (error) => {
            const tag = (error as { _tag?: string })._tag
            if (tag === 'AlreadyCaredTodayError') {
              toast.error(t('detail.toast.alreadyCaredToday'))
              return
            }
            toast.error(t(keys.error))
          },
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
      if (carePlant.isPending) return
      const keys = CARE_TOAST_KEYS[activePastCareType]
      carePlant.mutate(
        {
          params: { id: plantId },
          payload: { careType: activePastCareType, date },
        },
        {
          onSuccess: () =>
            toast.success(t(keys.success, { name: plant?.name })),
          onError: (error) => {
            const tag = (error as { _tag?: string })._tag
            if (tag === 'AlreadyCaredTodayError') {
              toast.error(t('detail.toast.alreadyCaredToday'))
              return
            }
            toast.error(t(keys.error))
          },
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

  const handleViewJournal = useCallback(() => {
    router.push(`/plant/${plantId}/journal`)
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
      sharePlant.mutate({ params: { id: plantId } })
    } catch {
      // User cancelled or capture failed — no action needed
    }
  }, [plant, plantId, sharePlant])

  const handleDelete = useCallback(() => {
    setShowOptionsSheet(false)
    setShowDeleteConfirm(true)
  }, [])

  const handleSayGoodbye = useCallback(() => {
    setShowOptionsSheet(false)
    setShowGoodbyeSheet(true)
  }, [])

  const handleConfirmGoodbye = useCallback(
    async (payload: SayGoodbyePayload) => {
      if (!plantId || !plant) return
      const result = await markPlantDead.mutateAsync({
        params: { id: plantId },
        payload,
      })
      pipe(
        result,
        Result.match({
          onFailure: () => toast.error(tCemetery('toast.goodbyeFailed')),
          onSuccess: () => {
            setShowGoodbyeSheet(false)
            toast.success(tCemetery('toast.goodbye', { name: plant.name }))
            router.back()
          },
        })
      )
    },
    [plantId, plant, markPlantDead, router, tCemetery]
  )

  // The API enforces the free-tier plant limit on revive, exactly like on
  // create, so the paywall alert mirrors the add-plant flow.
  const handleBringBack = useCallback(async () => {
    if (!plantId || !plant) return
    const result = await revivePlant.mutateAsync({ params: { id: plantId } })
    pipe(
      result,
      Result.match({
        onFailure: (error) =>
          pipe(
            Match.value(error),
            Match.when({ _tag: 'LimitExceededError' }, (e) =>
              showPlantLimitAlert(e, tCemetery('limit.title'), tCemetery)
            ),
            Match.orElse(() => toast.error(tCemetery('toast.bringBackFailed')))
          ),
        onSuccess: () =>
          toast.success(tCemetery('toast.broughtBack', { name: plant.name })),
      })
    )
  }, [plantId, plant, revivePlant, tCemetery])

  const handleShareToCanopy = useCallback(() => {
    if (!plantId || Option.isNone(myCanopy)) return
    const name = myCanopy.value.name
    Alert.alert(
      tCanopy('actions.shareTitle', { name }),
      tCanopy('actions.shareMessage', { name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: tCanopy('actions.share', { name }),
          onPress: () =>
            sharePlantWithCanopy.mutate(plantId, {
              onSuccess: () =>
                toast.success(tCanopy('actions.shared', { name })),
              onError: (error) =>
                pipe(
                  Match.value(error),
                  Match.tag('LimitExceededError', (e) =>
                    showPlantLimitAlert(e, tCemetery('limit.title'), tCanopy)
                  ),
                  Match.tag('PlantInDelegationError', () =>
                    toast.error(tCanopy('actions.shareDelegated', { name }))
                  ),
                  Match.orElse(() => toast.error(tCanopy('actions.failed')))
                ),
            }),
        },
      ]
    )
  }, [plantId, myCanopy, sharePlantWithCanopy, t, tCanopy, tCemetery])

  const handleUnshare = useCallback(() => {
    if (!plantId || !plant?.canopy) return
    const name = plant.canopy.name
    Alert.alert(
      tCanopy('actions.unshareTitle'),
      tCanopy('actions.unshareMessage', { name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: tCanopy('actions.unshare'),
          onPress: () =>
            unsharePlant.mutate(plantId, {
              onSuccess: () => toast.success(tCanopy('actions.unshared')),
              onError: (error) =>
                error._tag === 'LimitExceededError'
                  ? showPlantLimitAlert(
                      error,
                      tCemetery('limit.title'),
                      tCanopy
                    )
                  : toast.error(tCanopy('actions.failed')),
            }),
        },
      ]
    )
  }, [plantId, plant?.canopy, unsharePlant, t, tCanopy, tCemetery])

  const handleToggleMute = useCallback(() => {
    if (!plantId) return
    const muted = !plant?.muted
    setPlantMuted.mutate(
      { plantId, muted },
      {
        onSuccess: () =>
          toast.success(tCanopy(muted ? 'actions.muted' : 'actions.unmuted')),
        onError: () => toast.error(tCanopy('actions.failed')),
      }
    )
  }, [plantId, plant?.muted, setPlantMuted, tCanopy])

  // useEffectMutation resolves an API failure as Result.fail, so onSuccess
  // runs for a refused delete too: the toast must follow the Result.
  const handleConfirmDelete = useCallback(async () => {
    if (!plantId) return
    const result = await deletePlant.mutateAsync({ params: { id: plantId } })
    setShowDeleteConfirm(false)
    Result.match(result, {
      onFailure: () => toast.error(t('detail.toast.deleteFailed')),
      onSuccess: () => {
        toast.success(t('detail.toast.deleted', { name: plant?.name }))
        router.back()
      },
    })
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

  const isInitialLoading = isLoading && !plant
  const showSkeleton = useDelayedLoading(isInitialLoading)

  if (showSkeleton) {
    return (
      <Animated.View
        className="flex-1"
        entering={FadeIn.duration(300)}
        testID="plant-detail-skeleton-wrapper"
      >
        <PlantDetailSkeleton />
      </Animated.View>
    )
  }

  if (isInitialLoading) {
    return null
  }

  if (error || !plant || !scheduleData) {
    return <ErrorState onRetry={refetch} />
  }

  const healthStatus = mapApiHealthToCardHealth(plant.health)
  const diedAtOpt = Option.fromNullishOr(plant.diedAt)
  const isDead = Option.isSome(diedAtOpt)

  // Map photos from plant data
  const photos = Array.map(
    Option.getOrElse(Option.fromNullishOr(plant.photos), () => []),
    (photo) => ({
      id: photo.id,
      url: photo.url,
      createdAt: photo.takenAt,
    })
  )

  const actions = actionsOnPlant(plant, me, myCanopy)
  const isCanopyPlant = plant.ownership === 'canopy'

  const historyEvents = pipe(
    Option.fromNullishOr(careLogs?.items),
    Option.map(
      Array.map((log) => ({
        actor: isCanopyPlant ? careActorFor(log.performedBy, me) : undefined,
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
          actor?: ReturnType<typeof careActorFor> | undefined
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
                Option.fromNullishOr(plant.category)
              ),
              health: healthStatus,
              potWidthCm: plant.potWidthCm,
              potHeightCm: plant.potHeightCm,
              isDead,
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

          {/* Care Schedule — or the memorial for a plant in the cemetery */}
          <View className="mt-10">
            {pipe(
              diedAtOpt,
              Option.match({
                onSome: (diedAt) => (
                  <MemorialBanner
                    diedAt={diedAt}
                    cause={plant.deathCause}
                    note={plant.deathNote}
                  />
                ),
                onNone: () => (
                  <CareSchedule
                    wateringDays={scheduleData.daysUntilWater}
                    wateringDate={formatApiDateAsNextDate(
                      scheduleData.nextWaterAt
                    )}
                    fertilizingDays={scheduleData.daysUntilFertilize}
                    fertilizingDate={formatApiDateAsNextDate(
                      scheduleData.nextFertAt
                    )}
                    mistingDays={scheduleData.daysUntilMist}
                    mistingDate={formatApiDateAsNextDate(
                      scheduleData.nextMistAt
                    )}
                    repottingDays={scheduleData.daysUntilRepot}
                    repottingDate={formatApiDateAsNextDate(
                      scheduleData.nextRepotAt
                    )}
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
                      scheduleData.hasAnyCareHistory
                        ? handleCorrectDates
                        : undefined
                    }
                  />
                ),
              })
            )}
          </View>

          {/* AI care plans (accepted) */}
          {plantId && <PlantCarePlans plantId={plantId} />}

          {/* Growth Journal */}
          <View className="mt-10">
            <GrowthJournalEntryCard
              photos={photos}
              plantDateAdded={plant.dateAdded}
              totalCount={photos.length}
              onPhotoPress={handlePhotoPress}
              onPhoto={handlePhoto}
              onViewJournal={handleViewJournal}
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
        <HeaderButton
          icon="arrow-back"
          onPress={handleBack}
          accessibilityLabel={t('common:a11y.back')}
          iconColor={iconColors.textPrimary}
          testID="back-button"
          animatedFallbackStyle={animatedButtonStyle}
        />
        <View className="flex-row gap-2">
          <HeaderButton
            icon={plant.isFavorite ? 'favorite' : 'favorite-border'}
            onPress={handleToggleFavorite}
            accessibilityLabel={t(
              plant.isFavorite
                ? 'common:a11y.unfavorite'
                : 'common:a11y.favorite'
            )}
            iconColor={iconColors.textPrimary}
            animatedFallbackStyle={animatedButtonStyle}
          />
          <HeaderButton
            icon="more-vert"
            onPress={handleMoreOptions}
            accessibilityLabel={t('common:a11y.moreOptions')}
            iconColor={iconColors.textPrimary}
            testID="more-options-button"
            animatedFallbackStyle={animatedButtonStyle}
          />
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
        onSayGoodbye={handleSayGoodbye}
        onBringBack={handleBringBack}
        onDelete={handleDelete}
        isDead={isDead}
        canopyName={Option.match(myCanopy, {
          onNone: () => '',
          onSome: (c) => c.name,
        })}
        actions={actions}
        muted={plant.muted === true}
        canEndLife={actions.endLife}
        onShareToCanopy={handleShareToCanopy}
        onUnshare={handleUnshare}
        onToggleMute={handleToggleMute}
      />

      {/* Say Goodbye Sheet */}
      <SayGoodbyeSheet
        visible={showGoodbyeSheet}
        plantName={plant.name}
        isPending={markPlantDead.isPending}
        onClose={() => setShowGoodbyeSheet(false)}
        onConfirm={handleConfirmGoodbye}
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
        plantId={Option.getOrElse(Option.fromNullishOr(plantId), () => '')}
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
            Option.map(Option.fromNullishOr(plant.photos), (p) => p.length),
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
