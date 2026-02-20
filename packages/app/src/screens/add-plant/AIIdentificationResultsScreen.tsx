import { MaterialIcons } from '@expo/vector-icons'
import { LUMINOSITY_LEVELS, luxToLuminosityLevel } from '@lily/shared'
import { Array, Either, Match, Option, pipe } from 'effect'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedImage } from '@/components/AnimatedImage'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/Button'
import { useCreatePlant } from '@/hooks/useCreatePlant'
import { useIconColors } from '@/hooks/useIconColors'
import type { PlantIdentificationResult } from '@/hooks/useIdentifyPlant'
import { useReIdentifyPlant } from '@/hooks/useReIdentifyPlant'

export function AIIdentificationResultsScreen() {
  const { t } = useTranslation('addPlant')
  const params = useLocalSearchParams<{ photoUri?: string; result?: string }>()
  const iconColors = useIconColors()
  const photoUri = params.photoUri ? decodeURIComponent(params.photoUri) : ''

  const parsedResult = useMemo((): PlantIdentificationResult | null => {
    if (!params.result) return null
    try {
      return JSON.parse(decodeURIComponent(params.result))
    } catch {
      return null
    }
  }, [params.result])

  const [result, setResult] = useState<PlantIdentificationResult | null>(
    parsedResult
  )

  const { mutate: createPlant, isPending: isCreating } = useCreatePlant()
  const { mutate: reIdentify, isPending: isRetrying } = useReIdentifyPlant()

  const handleAddToCollection = () => {
    if (!result?.name) return

    createPlant(
      {
        payload: {
          name: result.name,
          category: Option.getOrUndefined(Option.fromNullable(result.category)),
          description: Option.getOrUndefined(
            Option.orElse(Option.fromNullable(result.description), () =>
              Option.fromNullable(result.family)
            )
          ),
          wateringFrequencyDays: Option.getOrElse(
            Option.fromNullable(result.wateringFrequencyDays),
            () => 7
          ),
          fertilizationFrequencyDays: Option.getOrUndefined(
            Option.fromNullable(result.fertilizationFrequencyDays)
          ),
          luxNeeded: Option.getOrElse(
            Option.fromNullable(result.luxNeeded),
            () => 2000
          ),
          humidityRating: Option.getOrElse(
            Option.fromNullable(result.humidityRating),
            () => 50
          ),
          petToxicityRating: Option.getOrElse(
            Option.fromNullable(result.petToxicityRating),
            () => 50
          ),
          imageUrl: result.imageUrl,
          remindersEnabled: true,
        },
      },
      {
        onSuccess: (apiResult) => {
          pipe(
            apiResult,
            Either.match({
              onLeft: (error) =>
                pipe(
                  Match.value(error),
                  Match.when({ _tag: 'LimitExceededError' }, (e) =>
                    Alert.alert(t('scanner.plantLimitReached'), e.message)
                  ),
                  Match.orElse(() =>
                    Alert.alert(t('scanner.error'), t('errors.createFailed'))
                  )
                ),
              onRight: (plant) => {
                router.dismissAll()
                router.push(`/plant/${plant.id}`)
              },
            })
          )
        },
      }
    )
  }

  const handleEdit = () => {
    if (!result?.name) return
    const prefillData = {
      name: result.name,
      category: result.category,
      description: Option.getOrUndefined(
        Option.orElse(Option.fromNullable(result.description), () =>
          Option.fromNullable(result.family)
        )
      ),
      wateringFrequencyDays: result.wateringFrequencyDays,
      luxNeeded: result.luxNeeded,
      humidityRating: result.humidityRating,
      petToxicityRating: result.petToxicityRating,
      fertilizationFrequencyDays: result.fertilizationFrequencyDays,
      wateringTips: result.wateringTips,
    }
    console.log(
      '[DEBUG AIResults] prefillData:',
      JSON.stringify(prefillData, null, 2)
    )
    const categoryParam = result.category
      ? `&prefillCategory=${encodeURIComponent(result.category)}`
      : ''
    router.push(
      `/add-plant/manual-basic?prefillName=${encodeURIComponent(result.name)}${categoryParam}&prefillData=${encodeURIComponent(JSON.stringify(prefillData))}`
    )
  }

  const handleRetry = () => {
    if (!result?.imageUrl || isRetrying) return

    reIdentify([result.imageUrl], {
      onSuccess: (newResult) => setResult(newResult),
      onError: () => {
        Alert.alert(
          t('scanner.error'),
          t('scanner.identificationFailedMessage')
        )
      },
    })
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
            {t('scanner.identificationFailed')}
          </Text>
          <Text className="text-base text-center mt-2 mb-6 font-regular text-text-muted dark:text-slate-400">
            {t('scanner.identificationFailedMessage')}
          </Text>
          <Button onPress={() => router.push('/add-plant/ai-scanner')}>
            {t('results.tryAgain')}
          </Button>
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
          {t('results.plantIdentified')}
        </Text>
        <View className="w-10 h-10" />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Hero Card */}
        <View className="p-4">
          <View className="rounded-[24px] overflow-hidden bg-white dark:bg-surface-dark shadow-lg shadow-black/20 border border-black/5 dark:border-slate-700">
            {/* Image Container */}
            <View className="relative w-full aspect-[4/3]">
              <AnimatedImage
                source={{ uri: photoUri }}
                className="w-full h-full"
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
                  {t('results.match', { percent: confidencePercent })}
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
                {result.luxNeeded != null && (
                  <View className="flex-row items-center h-7 rounded-full bg-surface-tinted dark:bg-slate-700 px-3 gap-1.5 border border-border dark:border-slate-600">
                    <MaterialIcons
                      name="wb-sunny"
                      size={14}
                      color={iconColors.primary}
                    />
                    <Text className="text-xs font-semibold text-text-primary dark:text-white">
                      {
                        LUMINOSITY_LEVELS[
                          luxToLuminosityLevel(result.luxNeeded)
                        ].label
                      }
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Suggested Care Section */}
        {(result.wateringFrequencyDays ||
          result.luxNeeded != null ||
          result.humidityRating != null) && (
          <View className="px-5 pt-2 pb-4">
            <Text className="text-lg font-bold text-text-primary dark:text-white pb-4">
              {t('results.suggestedCare')}
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
                      {t('results.water')}
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {t('results.everyDays', {
                        count: result.wateringFrequencyDays,
                      })}
                    </Text>
                  </View>
                </View>
              )}
              {result.luxNeeded != null && (
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
                      {t('results.light')}
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {
                        LUMINOSITY_LEVELS[
                          luxToLuminosityLevel(result.luxNeeded)
                        ].label
                      }
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
                      {t('results.humidity')}
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {pipe(
                        Match.value(result.humidityRating),
                        Match.when(
                          (r) => r >= 60,
                          () => t('results.humidityHigh')
                        ),
                        Match.when(
                          (r) => r >= 40,
                          () => t('results.humidityModerate')
                        ),
                        Match.orElse(() => t('results.humidityLow'))
                      )}{' '}
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
                      {t('results.petSafety')}
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {result.petToxicityRating > 50
                        ? t('results.toxicToPets')
                        : t('results.petSafe')}
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
                      {t('results.fertilizer')}
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {t('results.everyDays', {
                        count: result.fertilizationFrequencyDays,
                      })}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Other possibilities */}
        {!Array.isEmptyReadonlyArray(result.alternatives) && (
          <View className="px-5 pb-4">
            <Text className="text-sm font-medium text-text-muted dark:text-slate-400 mb-3">
              {t('results.otherPossibilities')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {pipe(
                result.alternatives,
                Array.filter((alt) => !!alt.name),
                Array.map((alt, index) => (
                  <Chip
                    key={`${alt.name}-${index}`}
                    label={`${alt.name} (${Math.round(alt.confidence * 100)}%)`}
                  />
                ))
              )}
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
          {t('results.addToCollection')}
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
              {t('results.editDetails')}
            </Text>
          </Pressable>
          <View className="h-4 w-px bg-border dark:bg-slate-600" />
          <Pressable
            onPress={handleRetry}
            disabled={isRetrying}
            className="flex-row items-center gap-1.5"
          >
            {isRetrying ? (
              <ActivityIndicator size={18} color={iconColors.textSecondary} />
            ) : (
              <MaterialIcons
                name="replay"
                size={18}
                color={iconColors.textSecondary}
              />
            )}
            <Text className="text-sm font-semibold text-text-secondary">
              {t('results.tryAgain')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
