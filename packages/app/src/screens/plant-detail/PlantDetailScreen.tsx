import { MaterialIcons } from '@expo/vector-icons'
import { daysUntilApiDate, formatApiDateAsNextDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useDeletePlant } from 'src/hooks/useDeletePlant'
import { useFertilizePlant } from 'src/hooks/useFertilizePlant'
import { useUpdatePlant } from 'src/hooks/useUpdatePlant'
import { useUploadPhoto } from 'src/hooks/useUploadPhoto'
import { useWaterPlant } from 'src/hooks/useWaterPlant'
import { iconColors } from 'src/theme'
import { useEffectQuery } from 'src/utils/client'
import { CareSchedule } from './components/CareSchedule'
import { ChatCTA } from './components/ChatCTA'
import { GallerySection } from './components/GallerySection'
import { IdealEnvironment } from './components/IdealEnvironment'
import { PlantHeader } from './components/PlantHeader'
import { PlantOptionsSheet } from './components/PlantOptionsSheet'
import { RecentHistory } from './components/RecentHistory'

type HealthStatus = 'healthy' | 'attention' | 'critical'

const mapApiHealthToCardHealth = (health: string): HealthStatus =>
  pipe(
    Match.value(health),
    Match.when('HEALTHY', () => 'healthy' as const),
    Match.when('THRIVING', () => 'healthy' as const),
    Match.when('NEEDS_ATTENTION', () => 'attention' as const),
    Match.when('SICK', () => 'critical' as const),
    Match.orElse(() => 'healthy' as const)
  )

type SunlightLevel = 'low' | 'indirect' | 'bright' | 'direct'
type WaterLevel = 'low' | 'moderate' | 'high'
type HumidityLevel = 'low' | 'moderate' | 'high' | 'tropical'

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
  return (
    <View className="flex-1 bg-background" testID="plant-detail-skeleton">
      <View className="h-[300px] bg-gray-200" />
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
  return (
    <View
      className="flex-1 bg-background items-center justify-center p-6"
      testID="plant-detail-error"
    >
      <MaterialIcons name="error-outline" size={48} color={iconColors.coral} />
      <Text className="text-lg text-center mt-4 font-semibold text-text-primary">
        Failed to load plant
      </Text>
      <Text className="text-sm text-center mt-2 font-regular text-text-muted">
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
  if (!imageUrl) {
    return (
      <View
        className="h-[300px] items-center justify-center bg-primary-tint"
        testID="plant-hero-placeholder"
      >
        <MaterialIcons
          name="local-florist"
          size={64}
          color={iconColors.primary}
        />
      </View>
    )
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      className="h-[300px] w-full"
      resizeMode="cover"
      testID="plant-hero-image"
    />
  )
}

export function PlantDetailScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [showOptionsSheet, setShowOptionsSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
    <View className="flex-1 bg-background" testID="plant-detail-screen">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        testID="plant-detail-scroll"
      >
        {/* Hero Image */}
        <PlantHeroImage imageUrl={plant.imageUrl} />

        {/* Content area with overlap */}
        <View
          className="bg-white px-4 pb-8"
          style={{
            marginTop: -24,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
          testID="plant-detail-content"
        >
          {/* Plant Header */}
          <View className="pt-6">
            <PlantHeader
              plant={{
                name: plant.name,
                category: plant.category ?? undefined,
                health: healthStatus,
              }}
            />
          </View>

          {/* Chat CTA */}
          <View className="mt-6">
            <ChatCTA plantName={plant.name} onPress={handleChat} />
          </View>

          {/* Care Schedule */}
          <View className="mt-8">
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
          <View className="mt-8">
            <IdealEnvironment
              sunlight={mapLightingRatingToSunlight(plant.lightingRating)}
              water={mapWateringRatingToWater(plant.wateringRating)}
              humidity={mapHumidityRatingToHumidity(plant.humidityRating)}
            />
          </View>

          {/* Gallery */}
          <View className="mt-8">
            <GallerySection
              photos={photos}
              onPhotoPress={handlePhotoPress}
              onAddPhoto={handleAddPhoto}
              onSeeAll={handleSeeAllPhotos}
            />
          </View>

          {/* Recent History */}
          <View className="mt-8 mb-4">
            <RecentHistory
              events={historyEvents}
              onViewAll={handleViewAllHistory}
            />
          </View>
        </View>
      </ScrollView>

      {/* Floating Header */}
      <View
        className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top + 8 }}
        testID="plant-detail-header"
      >
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full items-center justify-center bg-white/90"
          testID="back-button"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Pressable
          onPress={handleMoreOptions}
          className="w-10 h-10 rounded-full items-center justify-center bg-white/90"
          testID="more-options-button"
        >
          <MaterialIcons
            name="more-horiz"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
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
