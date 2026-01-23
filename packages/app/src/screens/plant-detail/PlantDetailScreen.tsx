import { MaterialIcons } from '@expo/vector-icons'
import { daysUntilApiDate, formatApiDateAsNextDate } from '@lily/shared'
import { Array, Match, pipe } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useUploadPhoto } from 'src/hooks/useUploadPhoto'
import { iconColors } from 'src/theme'
import { useEffectQuery } from 'src/utils/client'
import { CareSchedule } from './components/CareSchedule'
import { GallerySection } from './components/GallerySection'
import { IdealEnvironment } from './components/IdealEnvironment'
import { PlantHeader } from './components/PlantHeader'
import { PlantOptionsSheet } from './components/PlantOptionsSheet'
import { QuickActions } from './components/QuickActions'
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

  const uploadPhoto = useUploadPhoto()

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleMoreOptions = useCallback(() => {
    setShowOptionsSheet(true)
  }, [])

  const handleWater = useCallback(() => {
    // TODO: Implement water action (T4.12)
    console.log('Water plant:', plantId)
  }, [plantId])

  const handleFertilize = useCallback(() => {
    // TODO: Implement fertilize action (T4.13)
    console.log('Fertilize plant:', plantId)
  }, [plantId])

  const handlePhoto = useCallback(() => {
    // TODO: Navigate to add photo
    console.log('Add photo for plant:', plantId)
  }, [plantId])

  const handleChat = useCallback(() => {
    // TODO: Navigate to AI chat about this plant
    console.log('Chat about plant:', plantId)
  }, [plantId])

  const handleEditSchedule = useCallback(() => {
    // TODO: Navigate to edit care schedule
    console.log('Edit schedule for plant:', plantId)
  }, [plantId])

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
    // TODO: Navigate to full history
    console.log('View all history for plant:', plantId)
  }, [plantId])

  const handleEdit = useCallback(() => {
    // TODO: Navigate to edit plant (T4.09)
    console.log('Edit plant:', plantId)
  }, [plantId])

  const handleToggleFavorite = useCallback(() => {
    // TODO: Implement favorite toggle (T4.10)
    console.log('Toggle favorite for plant:', plantId)
  }, [plantId])

  const handleExportHistory = useCallback(() => {
    // TODO: Export care history
    console.log('Export history for plant:', plantId)
  }, [plantId])

  const handleShare = useCallback(() => {
    // TODO: Share plant profile
    console.log('Share plant:', plantId)
  }, [plantId])

  const handleDelete = useCallback(() => {
    setShowOptionsSheet(false)
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    // TODO: Delete plant and navigate back (T4.11)
    console.log('Delete plant:', plantId)
    setShowDeleteConfirm(false)
    router.back()
  }, [plantId, router])

  if (isLoading) {
    return <PlantDetailSkeleton />
  }

  if (error || !plant) {
    return <ErrorState onRetry={refetch} />
  }

  const healthStatus = mapApiHealthToCardHealth(plant.health)

  // Calculate days until watering/fertilizing using shared utilities
  const daysUntilWater = daysUntilApiDate(plant.nextWateringAt)
  const daysUntilFertilize = daysUntilApiDate(plant.nextFertilizationAt)

  // Map photos from plant data
  const photos = Array.map(plant.photos ?? [], (photo) => ({
    id: photo.id,
    url: photo.url,
    createdAt: photo.takenAt,
  }))

  // Mock history events - would come from API
  const historyEvents: Array<{
    id: string
    type: 'watered' | 'fertilized' | 'misted' | 'pruned' | 'repotted'
    date: Date
    notes?: string
  }> = []

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

          {/* Quick Actions */}
          <View className="mt-6">
            <QuickActions
              onWater={handleWater}
              onFertilize={handleFertilize}
              onPhoto={handlePhoto}
              onChat={handleChat}
            />
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
        isFavorite={false}
        onEdit={handleEdit}
        onToggleFavorite={handleToggleFavorite}
        onExportHistory={handleExportHistory}
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
