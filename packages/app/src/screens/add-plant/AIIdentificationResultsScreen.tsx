import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Chip } from 'src/components/Chip'
import { Button } from 'src/components/ui/Button'
import { useCreatePlant } from 'src/hooks/useCreatePlant'
import type { PlantIdentificationResult } from 'src/hooks/useIdentifyPlant'
import { iconColors } from 'src/theme'
import { ApiError } from 'src/utils/client'

export function AIIdentificationResultsScreen() {
  const params = useLocalSearchParams<{ photoUri?: string; result?: string }>()
  const photoUri = params.photoUri ? decodeURIComponent(params.photoUri) : ''

  const result = useMemo((): PlantIdentificationResult | null => {
    if (!params.result) return null
    try {
      return JSON.parse(decodeURIComponent(params.result))
    } catch {
      return null
    }
  }, [params.result])

  const { mutate: createPlant, isPending: isCreating } = useCreatePlant()

  const handleAddToCollection = () => {
    if (!result?.name) return

    createPlant(
      {
        payload: {
          name: result.name,
          category: result.category ?? undefined,
          description: result.description ?? result.family ?? undefined,
          wateringFrequencyDays: result.wateringFrequencyDays ?? 7,
          fertilizationFrequencyDays:
            result.fertilizationFrequencyDays ?? undefined,
          sunlightPreference: result.sunlightPreference ?? 'medium',
          humidityRating: result.humidityRating ?? 50,
          petToxicityRating: result.petToxicityRating ?? 50,
          imageUrl: result.imageUrl,
          remindersEnabled: true,
        },
      },
      {
        onSuccess: (plant) => {
          router.dismissAll()
          router.push(`/plant/${plant.id}`)
        },
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error._tag === 'LimitExceededError'
          ) {
            Alert.alert(
              'Plant Limit Reached',
              "You've reached your limit of plants on the free plan. Upgrade to Premium for unlimited plants!"
            )
            return
          }

          Alert.alert('Error', 'Failed to create plant. Please try again.')
        },
      }
    )
  }

  const handleEdit = () => {
    if (!result?.name) return
    const prefillData = {
      name: result.name,
      category: result.category,
      description: result.description ?? result.family,
      wateringFrequencyDays: result.wateringFrequencyDays,
      sunlightPreference: result.sunlightPreference,
      humidityRating: result.humidityRating,
      petToxicityRating: result.petToxicityRating,
      fertilizationFrequencyDays: result.fertilizationFrequencyDays,
    }
    router.push(
      `/add-plant/manual-basic?prefillName=${encodeURIComponent(result.name)}&prefillData=${encodeURIComponent(JSON.stringify(prefillData))}`
    )
  }

  const handleRetry = () => {
    router.push('/add-plant/ai-scanner')
  }

  if (!result || !result.name) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-6">
          <MaterialIcons
            name="error-outline"
            size={64}
            color={iconColors.coral}
          />
          <Text className="text-xl text-center mt-4 font-semibold text-text-primary">
            Identification Failed
          </Text>
          <Text className="text-base text-center mt-2 mb-6 font-regular text-text-muted">
            We couldn't identify this plant. Try taking another photo or add it
            manually.
          </Text>
          <Button onPress={handleRetry}>Try Again</Button>
        </View>
      </SafeAreaView>
    )
  }

  const confidencePercent = Math.round(result.confidence * 100)

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="relative">
          <Image
            source={{ uri: photoUri }}
            style={{ width: '100%', aspectRatio: 4 / 3 }}
            resizeMode="cover"
          />
          <Pressable
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons name="close" size={24} color={iconColors.white} />
          </Pressable>
          <View className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-primary">
            <Text className="text-sm font-semibold text-white">
              {confidencePercent}% Match
            </Text>
          </View>
        </View>

        <View className="px-6 py-4">
          <Text className="text-2xl font-bold text-text-primary">
            {result.name}
          </Text>
          {result.family && (
            <Text className="text-base mt-1 font-regular text-text-secondary">
              {result.family}
            </Text>
          )}

          {result.alternatives.length > 0 && (
            <View className="mt-6">
              <Text className="text-sm font-medium text-text-muted mb-3">
                Other possibilities
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {result.alternatives
                  .filter((alt) => alt.name)
                  .map((alt, index) => (
                    <Chip
                      key={`${alt.name}-${index}`}
                      label={`${alt.name} (${Math.round(alt.confidence * 100)}%)`}
                    />
                  ))}
              </View>
            </View>
          )}

          {(result.wateringFrequencyDays ||
            result.sunlightPreference ||
            result.humidityRating != null) && (
            <View className="mt-6">
              <Text className="text-sm font-medium text-text-muted mb-3">
                Care recommendations
              </Text>
              <View className="bg-surface-tinted rounded-lg p-4 gap-3">
                {result.wateringFrequencyDays && (
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name="water-drop"
                      size={18}
                      color={iconColors.primary}
                    />
                    <Text className="text-sm ml-2 font-regular text-text-primary">
                      Water every {result.wateringFrequencyDays} days
                    </Text>
                  </View>
                )}
                {result.sunlightPreference && (
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name="wb-sunny"
                      size={18}
                      color={iconColors.primary}
                    />
                    <Text className="text-sm ml-2 font-regular text-text-primary">
                      {result.sunlightPreference === 'high'
                        ? 'Bright light'
                        : result.sunlightPreference === 'medium'
                          ? 'Medium light'
                          : 'Low light'}
                    </Text>
                  </View>
                )}
                {result.humidityRating != null && (
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name="opacity"
                      size={18}
                      color={iconColors.primary}
                    />
                    <Text className="text-sm ml-2 font-regular text-text-primary">
                      Humidity: {result.humidityRating}%
                    </Text>
                  </View>
                )}
                {result.petToxicityRating != null && (
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name="pets"
                      size={18}
                      color={
                        result.petToxicityRating > 50
                          ? iconColors.coral
                          : iconColors.primary
                      }
                    />
                    <Text className="text-sm ml-2 font-regular text-text-primary">
                      {result.petToxicityRating > 50
                        ? 'Toxic to pets'
                        : 'Pet-safe'}
                    </Text>
                  </View>
                )}
                {result.fertilizationFrequencyDays && (
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name="eco"
                      size={18}
                      color={iconColors.primary}
                    />
                    <Text className="text-sm ml-2 font-regular text-text-primary">
                      Fertilize every {result.fertilizationFrequencyDays} days
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {result.description && (
            <View className="mt-4">
              <Text className="text-sm font-regular text-text-secondary">
                {result.description}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View className="px-6 py-4 bg-background">
        <Button
          onPress={handleAddToCollection}
          loading={isCreating}
          disabled={isCreating}
        >
          Add to Collection
        </Button>
        <View className="flex-row justify-center gap-6 mt-4">
          <Pressable onPress={handleEdit}>
            <Text className="text-base font-medium text-primary">
              Edit Details
            </Text>
          </Pressable>
          <Pressable onPress={handleRetry}>
            <Text className="text-base font-medium text-primary">
              Try Again
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
