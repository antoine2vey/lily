import { MaterialIcons } from '@expo/vector-icons'
import { daysUntilApiDate, formatApiDateAsNextDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useDeletePlant } from 'src/hooks/useDeletePlant'
import { useFertilizePlant } from 'src/hooks/useFertilizePlant'
import { useIconColors } from 'src/hooks/useIconColors'
import { useTheme } from 'src/hooks/useTheme'
import { useUpdatePlant } from 'src/hooks/useUpdatePlant'
import { useUploadPhoto } from 'src/hooks/useUploadPhoto'
import { useWaterPlant } from 'src/hooks/useWaterPlant'
import { useEffectQuery } from 'src/utils/client'
import { mapApiHealthToCardHealth } from 'src/utils/health'
import { CareSchedule } from './components/CareSchedule'
import { ChatCTA } from './components/ChatCTA'
import { GallerySection } from './components/GallerySection'
import { IdealEnvironment } from './components/IdealEnvironment'
import { PlantHeader } from './components/PlantHeader'
import { PlantOptionsSheet } from './components/PlantOptionsSheet'
import { RecentHistory } from './components/RecentHistory'

type SunlightLevel = 'low' | 'indirect' | 'bright' | 'direct'
type WaterLevel = 'low' | 'moderate' | 'high'
type HumidityLevel = 'low' | 'moderate' | 'high' | 'tropical'

const HERO_HEIGHT = Dimensions.get('window').height * 0.45

const mapLightingRatingToSunlight = (rating: number): SunlightLevel => {
  if (rating <= 2) return 'low'
  if (rating <= 4) return 'indirect'
  if (rating <= 6) return 'bright'
  return 'direct'
}

const mapWateringRatingToWater = (rating: number): WaterLevel => {
  if (rating <= 3) return 'low'
  if (rating <= 6) return 'moderate'
  return 'high'
}

const mapHumidityRatingToHumidity = (rating: number): HumidityLevel => {
  if (rating <= 2) return 'low'
  if (rating <= 5) return 'moderate'
  if (rating <= 7) return 'high'
  return 'tropical'
}

function PlantDetailSkeleton() {
  const iconColors = useIconColors()
  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      testID="plant-detail-skeleton"
    >
      <View
        style={{ height: HERO_HEIGHT }}
        className="bg-gray-200 dark:bg-slate-700"
      />
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    </View>
  )
}

interface ErrorStateProps {
  onRetry: () => void
}

function ErrorState({ onRetry }: ErrorStateProps) {
  const iconColors = useIconColors()
  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark items-center justify-center p-6"
      testID="plant-detail-error"
    >
      <MaterialIcons name="error-outline" size={48} color={iconColors.coral} />
      <Text className="text-lg text-center mt-4 font-semibold text-text-primary dark:text-white">
        Failed to load plant
      </Text>
      <Text className="text-sm text-center mt-2 font-regular text-text-muted dark:text-slate-400">
        Something went wrong while loading plant details.
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-6 px-6 py-3 rounded-full bg-primary"
      >
        <Text className="font-semibold text-white">Try Again</Text>
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
    <Image
      source={{ uri: imageUrl }}
      style={{ height: HERO_HEIGHT }}
      className="w-full"
      resizeMode="cover"
      testID="plant-hero-image"
    />
  )
}

export function PlantDetailScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { isDark } = useTheme()

  const [showOptionsSheet, setShowOptionsSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
  } = useEffectQuery('plants', 'getPlant', {
    path: { id: plantId ?? '' },
  })

  const { data: careLogs } = useEffectQuery('careLogs', 'getCareLogs', {
    path: { plantId: plantId ?? '' },
    urlParams: { page: '1', limit: '3', type: 'all' },
  })

  const uploadPhoto = useUploadPhoto()
  const waterPlant = useWaterPlant()
  const fertilizePlant = useFertilizePlant()
  const updatePlant = useUpdatePlant(plantId ?? '')
  const deletePlant = useDeletePlant()

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleMoreOptions = useCallback(() => {
    setShowOptionsSheet(true)
  }, [])

  const handleChat = useCallback(() => {
    router.push(`/plant/${plantId}/chat`)
  }, [plantId, router])

  const handleWaterNow = useCallback(() => {
    if (!plantId) return
    waterPlant.mutate(
      { path: { id: plantId }, payload: {} },
      {
        onSuccess: () => toast.success(`${plant?.name} watered!`),
        onError: () => toast.error('Failed to water plant'),
      }
    )
  }, [plantId, plant?.name, waterPlant])

  const handleFertilizeNow = useCallback(() => {
    if (!plantId) return
    fertilizePlant.mutate(
      { path: { id: plantId } },
      {
        onSuccess: () => toast.success(`${plant?.name} fertilized!`),
        onError: () => toast.error('Failed to fertilize plant'),
      }
    )
  }, [plantId, plant?.name, fertilizePlant])

  const handleEditSchedule = useCallback(() => {
    router.push(`/plant/${plantId}/edit`)
  }, [plantId, router])

  const handlePhotoPress = useCallback(
    (photoId: string) => {
      router.push(`/plant/${plantId}/photo/${photoId}`)
    },
    [router, plantId]
  )

  const handleAddPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0] && plantId) {
      uploadPhoto.mutate({
        plantId,
        photoUri: result.assets[0].uri,
      })
    }
  }, [plantId, uploadPhoto])

  const handleSeeAllPhotos = useCallback(() => {
    router.push(`/plant/${plantId}/gallery`)
  }, [router, plantId])

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
              ? `${plant.name} removed from favorites`
              : `${plant.name} added to favorites!`
          )
        },
        onError: () => toast.error('Failed to update favorite'),
      }
    )
  }, [plantId, plant, updatePlant])

  const handleShare = useCallback(async () => {
    if (!plant) return
    await Share.share({
      message: `Check out my plant "${plant.name}" on Lily!`,
    })
  }, [plant])

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
          toast.success(`${plant?.name} deleted`)
          router.back()
        },
        onError: () => {
          setShowDeleteConfirm(false)
          toast.error('Failed to delete plant')
        },
      }
    )
  }, [plantId, plant?.name, deletePlant, router])

  if (isLoading) {
    return <PlantDetailSkeleton />
  }

  if (error || !plant) {
    return <ErrorState onRetry={refetch} />
  }

  const healthStatus = mapApiHealthToCardHealth(plant.health)

  // Calculate days until watering/fertilizing using shared utilities
  const daysUntilWater = daysUntilApiDate(plant.nextWateringAt)
  // Only show fertilizing days if there's a schedule set
  const daysUntilFertilize = plant.fertilizationFrequencyDays
    ? daysUntilApiDate(plant.nextFertilizationAt)
    : null

  // Map photos from plant data
  const photos = Array.map(plant.photos ?? [], (photo) => ({
    id: photo.id,
    url: photo.url,
    createdAt: photo.takenAt,
  }))

  const historyEvents = pipe(
    Option.fromNullable(careLogs?.items),
    Option.map(
      Array.map((log) => ({
        id: log.id,
        type: pipe(
          Match.value(log.type),
          Match.when('watering', () => 'watered' as const),
          Match.when('fertilization', () => 'fertilized' as const),
          Match.exhaustive
        ),
        date: log.date,
      }))
    ),
    Option.getOrElse(
      () =>
        [] as {
          id: string
          type: 'watered' | 'fertilized'
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
              category: plant.category ?? undefined,
              health: healthStatus,
            }}
          />

          {/* Chat CTA */}
          <View className="mt-8">
            <ChatCTA plantName={plant.name} onPress={handleChat} />
          </View>

          {/* Care Schedule */}
          <View className="mt-10">
            <CareSchedule
              wateringDays={daysUntilWater}
              wateringDate={formatApiDateAsNextDate(plant.nextWateringAt)}
              fertilizingDays={daysUntilFertilize}
              fertilizingDate={formatApiDateAsNextDate(
                plant.nextFertilizationAt
              )}
              onEdit={handleEditSchedule}
              onWaterNow={handleWaterNow}
              onFertilizeNow={handleFertilizeNow}
            />
          </View>

          {/* Ideal Environment */}
          <View className="mt-10">
            <IdealEnvironment
              sunlight={mapLightingRatingToSunlight(plant.lightingRating)}
              water={mapWateringRatingToWater(plant.wateringRating)}
              humidity={mapHumidityRatingToHumidity(plant.humidityRating)}
            />
          </View>

          {/* Gallery */}
          <View className="mt-10">
            <GallerySection
              photos={photos}
              onPhotoPress={handlePhotoPress}
              onAddPhoto={handleAddPhoto}
              onSeeAll={handleSeeAllPhotos}
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

      {/* Delete Confirmation */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={`Delete ${plant.name}?`}
        message="This will permanently remove all care history and photos. This action cannot be undone."
        confirmLabel="Delete Plant"
        cancelLabel="Keep Plant"
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
