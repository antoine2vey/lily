import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chip } from 'src/components/Chip'
import { Button } from 'src/components/ui/Button'
import { useCreatePlant } from 'src/hooks/useCreatePlant'
import { useIconColors } from 'src/hooks/useIconColors'
import type { PlantIdentificationResult } from 'src/hooks/useIdentifyPlant'
import { ApiError } from 'src/utils/client'

export function AIIdentificationResultsScreen() {
  const params = useLocalSearchParams<{ photoUri?: string; result?: string }>()
  const iconColors = useIconColors()
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
            Alert.alert('Plant Limit Reached', error.message)
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

  const insets = useSafeAreaInsets()

  if (!result || !result.name) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-1 items-center justify-center px-6">
          <MaterialIcons
            name="error-outline"
            size={64}
            color={iconColors.coral}
          />
          <Text className="text-xl text-center mt-4 font-semibold text-text-primary dark:text-white">
            Identification Failed
          </Text>
          <Text className="text-base text-center mt-2 mb-6 font-regular text-text-muted dark:text-slate-400">
            We couldn't identify this plant. Try taking another photo or add it
            manually.
          </Text>
          <Button onPress={handleRetry}>Try Again</Button>
        </View>
      </View>
    )
  }

  const confidencePercent = Math.round(result.confidence * 100)

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-2 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back-ios-new"
            size={20}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          Plant Identified
        </Text>
        <View className="w-10 h-10" />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Hero Card */}
        <View className="p-4">
          <View className="rounded-[24px] overflow-hidden bg-white dark:bg-surface-dark shadow-lg shadow-black/20 border border-black/5 dark:border-slate-700">
            {/* Image Container */}
            <View className="relative w-full aspect-[4/3]">
              <Image
                source={{ uri: photoUri }}
                className="w-full h-full"
                resizeMode="cover"
              />
              {/* Gradient Overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.3)']}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '50%',
                }}
              />
              {/* Confidence Badge */}
              <View className="absolute top-4 right-4 bg-white/90 rounded-full px-3 py-1.5 flex-row items-center gap-1.5">
                <MaterialIcons
                  name="verified"
                  size={16}
                  color={iconColors.primary}
                />
                <Text className="text-xs font-bold text-primary">
                  {confidencePercent}% Match
                </Text>
              </View>
            </View>

            {/* Plant Info */}
            <View className="p-5 gap-3">
              <View className="gap-0.5">
                <Text className="text-2xl font-extrabold text-text-primary dark:text-white">
                  {result.name}
                </Text>
                {result.family && (
                  <Text className="text-base font-medium text-primary/70">
                    {result.family}
                  </Text>
                )}
              </View>

              {/* Tags */}
              <View className="flex-row flex-wrap gap-2">
                {result.category && (
                  <View className="flex-row items-center h-7 rounded-full bg-surface-tinted dark:bg-slate-700 px-3 gap-1.5 border border-border dark:border-slate-600">
                    <MaterialIcons
                      name="forest"
                      size={14}
                      color={iconColors.primary}
                    />
                    <Text className="text-xs font-semibold text-text-primary dark:text-white">
                      {result.category}
                    </Text>
                  </View>
                )}
                {result.sunlightPreference && (
                  <View className="flex-row items-center h-7 rounded-full bg-surface-tinted dark:bg-slate-700 px-3 gap-1.5 border border-border dark:border-slate-600">
                    <MaterialIcons
                      name="wb-sunny"
                      size={14}
                      color={iconColors.primary}
                    />
                    <Text className="text-xs font-semibold text-text-primary dark:text-white">
                      {result.sunlightPreference === 'high'
                        ? 'High Light'
                        : result.sunlightPreference === 'medium'
                          ? 'Medium Light'
                          : 'Low Light'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Suggested Care Section */}
        {(result.wateringFrequencyDays ||
          result.sunlightPreference ||
          result.humidityRating != null) && (
          <View className="px-5 pt-2 pb-4">
            <Text className="text-lg font-bold text-text-primary dark:text-white pb-4">
              Suggested Care
            </Text>
            <View className="bg-surface-tinted dark:bg-slate-800 rounded-2xl p-4 gap-3">
              {result.wateringFrequencyDays && (
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 items-center justify-center">
                    <MaterialIcons
                      name="water-drop"
                      size={20}
                      color={iconColors.primary}
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text-primary dark:text-white">
                      Water
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      Every {result.wateringFrequencyDays} days
                    </Text>
                  </View>
                </View>
              )}
              {result.sunlightPreference && (
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 items-center justify-center">
                    <MaterialIcons
                      name="wb-sunny"
                      size={20}
                      color={iconColors.primary}
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text-primary dark:text-white">
                      Light
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {result.sunlightPreference === 'high'
                        ? 'Bright indirect'
                        : result.sunlightPreference === 'medium'
                          ? 'Medium indirect'
                          : 'Low light'}
                    </Text>
                  </View>
                </View>
              )}
              {result.humidityRating != null && (
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 items-center justify-center">
                    <MaterialIcons
                      name="opacity"
                      size={20}
                      color={iconColors.primary}
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text-primary dark:text-white">
                      Humidity
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {result.humidityRating >= 60
                        ? 'High'
                        : result.humidityRating >= 40
                          ? 'Moderate'
                          : 'Low'}{' '}
                      ({result.humidityRating}%)
                    </Text>
                  </View>
                </View>
              )}
              {result.petToxicityRating != null && (
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 items-center justify-center">
                    <MaterialIcons
                      name="pets"
                      size={20}
                      color={
                        result.petToxicityRating > 50
                          ? iconColors.coral
                          : iconColors.primary
                      }
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text-primary dark:text-white">
                      Pet Safety
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {result.petToxicityRating > 50
                        ? 'Toxic to pets'
                        : 'Pet-safe'}
                    </Text>
                  </View>
                </View>
              )}
              {result.fertilizationFrequencyDays && (
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 items-center justify-center">
                    <MaterialIcons
                      name="eco"
                      size={20}
                      color={iconColors.primary}
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text-primary dark:text-white">
                      Fertilizer
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      Every {result.fertilizationFrequencyDays} days
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Other possibilities */}
        {result.alternatives.length > 0 && (
          <View className="px-5 pb-4">
            <Text className="text-sm font-medium text-text-muted dark:text-slate-400 mb-3">
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

        {result.description && (
          <View className="px-5 pb-4">
            <Text className="text-sm font-regular text-text-secondary dark:text-slate-400">
              {result.description}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Area */}
      <View
        className="px-5 pt-4 bg-background dark:bg-background-dark"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Button
          onPress={handleAddToCollection}
          loading={isCreating}
          disabled={isCreating}
          pill
          icon="add-circle"
          iconPosition="left"
        >
          Add to Collection
        </Button>
        <View className="flex-row items-center justify-center gap-8 pt-4">
          <Pressable
            onPress={handleEdit}
            className="flex-row items-center gap-1.5"
          >
            <MaterialIcons
              name="edit"
              size={18}
              color={iconColors.textSecondary}
            />
            <Text className="text-sm font-semibold text-text-secondary">
              Edit Details
            </Text>
          </Pressable>
          <View className="h-4 w-px bg-border dark:bg-slate-600" />
          <Pressable
            onPress={handleRetry}
            className="flex-row items-center gap-1.5"
          >
            <MaterialIcons
              name="replay"
              size={18}
              color={iconColors.textSecondary}
            />
            <Text className="text-sm font-semibold text-text-secondary">
              Try Again
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
