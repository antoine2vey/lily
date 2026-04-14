import { MaterialIcons } from '@expo/vector-icons'
import type { CatalogPlant } from '@lily/shared'
import { keepPreviousData } from '@tanstack/react-query'
import { Array as Arr, Either, Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useCreatePlant } from '@/hooks/useCreatePlant'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useIconColors } from '@/hooks/useIconColors'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'
import { useEffectQuery } from '@/utils/client'

interface AddPlantStepProps {
  onScan: () => void
  onPlantAdded: (data: Partial<OnboardingData>) => void
  onSkip: () => void
}

function CatalogItem({
  plant,
  onSelect,
  loading,
}: {
  plant: CatalogPlant
  onSelect: () => void
  loading: boolean
}) {
  const iconColors = useIconColors()

  return (
    <Pressable
      onPress={onSelect}
      disabled={loading}
      className="flex-row items-center py-3 px-4 border-b border-border/30 dark:border-slate-700/30"
    >
      <View className="w-10 h-10 rounded-full bg-primary-tint dark:bg-slate-700 items-center justify-center mr-3">
        <MaterialIcons name="eco" size={20} color={iconColors.primary} />
      </View>
      <View className="flex-1">
        <Text
          className="text-base text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {plant.name}
        </Text>
        <Text className="text-xs text-text-muted dark:text-slate-500 mt-0.5">
          {pipe(
            [plant.scientificName, plant.category],
            Arr.map(Option.fromNullable),
            Arr.getSomes,
            Arr.join(' · ')
          )}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={iconColors.primary} />
      ) : (
        <MaterialIcons
          name="add-circle-outline"
          size={24}
          color={iconColors.primary}
        />
      )}
    </Pressable>
  )
}

export function AddPlantStep({
  onScan,
  onPlantAdded,
  onSkip,
}: AddPlantStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [addingPlantId, setAddingPlantId] = useState<string | null>(null)
  const { mutateAsync: createPlant } = useCreatePlant()

  const debouncedQuery = useDebouncedValue(searchQuery, 300)

  const { data: catalogResult } = useEffectQuery(
    'plantCatalog',
    'getPlantCatalog',
    {
      urlParams: {
        q: debouncedQuery,
      },
    },
    { enabled: showSearch, placeholderData: keepPreviousData }
  )

  const catalogPlants = catalogResult ?? []

  const handleSelectPlant = async (plant: CatalogPlant) => {
    setAddingPlantId(plant.id)
    try {
      const result = await createPlant({
        payload: {
          name: plant.name,
          description: plant.description ?? undefined,
          category: plant.category ?? undefined,
          wateringFrequencyDays: plant.wateringFrequencyDays,
          fertilizationFrequencyDays:
            plant.fertilizationFrequencyDays ?? undefined,
          mistingFrequencyDays: plant.mistingFrequencyDays ?? undefined,
          repottingFrequencyDays: plant.repottingFrequencyDays ?? undefined,
          luxNeeded: plant.luxNeeded ?? 2500,
          humidityRating: plant.humidityRating,
          petToxicityRating: plant.petToxicityRating,
          remindersEnabled: true,
        },
      })
      if (Either.isRight(result)) {
        onPlantAdded({
          plantName: plant.name,
          plantDays: plant.wateringFrequencyDays,
        })
      }
    } catch {
      // Fall through — user can retry or skip
    } finally {
      setAddingPlantId(null)
    }
  }

  if (showSearch) {
    return (
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-center mb-4">
          <Pressable
            onPress={() => {
              setShowSearch(false)
              setSearchQuery('')
            }}
            className="mr-3"
          >
            <MaterialIcons
              name="arrow-back"
              size={24}
              color={iconColors.primary}
            />
          </Pressable>
          <Text
            className="text-lg font-semibold text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('addPlant.addManually')}
          </Text>
        </View>

        <TextInput
          className="bg-input-bg dark:bg-slate-800 rounded-xl px-4 py-3 text-base text-text-primary dark:text-white mb-4"
          placeholder={t('addPlant.searchPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />

        <FlatList
          data={catalogPlants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CatalogItem
              plant={item}
              onSelect={() => handleSelectPlant(item)}
              loading={addingPlantId === item.id}
            />
          )}
          className="bg-surface dark:bg-slate-800 rounded-xl"
          ListEmptyComponent={
            <View className="py-8 items-center">
              <Text className="text-sm text-text-muted dark:text-slate-500">
                {searchQuery
                  ? t('addPlant.noResults')
                  : t('addPlant.searchHint')}
              </Text>
            </View>
          }
        />

        <Pressable onPress={onSkip} className="mt-auto mb-4 py-3 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-500 underline">
            {t('addPlant.skipLabel')}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Illustration */}
      <View className="items-center mb-10">
        <View className="w-40 h-40 rounded-3xl items-center justify-center bg-primary-tint dark:bg-slate-800">
          <MaterialIcons
            name="camera-alt"
            size={80}
            color={iconColors.primary}
          />
        </View>
      </View>

      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {t('addPlant.title')}
      </Text>
      <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-10">
        {t('addPlant.subtitle')}
      </Text>

      <View className="gap-3">
        {/* Scan with camera */}
        <Pressable
          onPress={onScan}
          className="flex-row items-center justify-center py-4 rounded-full bg-primary active:bg-primary-dark"
        >
          <MaterialIcons name="camera-alt" size={20} color={iconColors.white} />
          <Text
            className="text-base font-semibold text-white ml-2"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('addPlant.scanCamera')}
          </Text>
        </Pressable>

        {/* Search by name */}
        <Pressable
          onPress={() => setShowSearch(true)}
          className="flex-row items-center justify-center py-4 rounded-full border border-primary"
        >
          <MaterialIcons name="search" size={20} color={iconColors.primary} />
          <Text
            className="text-base font-semibold text-primary ml-2"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('addPlant.addManually')}
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={onSkip} className="mt-auto mb-4 py-3 items-center">
        <Text className="text-sm text-text-muted dark:text-slate-500 underline">
          {t('addPlant.skipLabel')}
        </Text>
      </Pressable>
    </View>
  )
}
