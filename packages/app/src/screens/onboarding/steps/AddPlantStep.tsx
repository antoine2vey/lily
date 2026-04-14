import { MaterialIcons } from '@expo/vector-icons'
import type { CatalogPlant } from '@lily/shared'
import { keepPreviousData } from '@tanstack/react-query'
import { Array as Arr, Either, Option, pipe } from 'effect'
import { BlurView } from 'expo-blur'
import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/Button'
import { useThemeContext } from '@/contexts/ThemeContext'
import { useCreatePlant } from '@/hooks/useCreatePlant'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'
import { useEffectQuery } from '@/utils/client'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

interface AddPlantStepProps {
  onScan: () => void
  onPlantAdded: (data: Partial<OnboardingData>) => void
  onSkip: () => void
}

const CatalogItem = memo(function CatalogItem({
  plant,
  onSelect,
  loading,
}: {
  plant: CatalogPlant
  onSelect: () => void
  loading: boolean
}) {
  return (
    <Pressable
      onPress={onSelect}
      disabled={loading}
      className="flex-row items-center py-3 px-4 border-b border-white/10"
    >
      <Text className="text-lg mr-3">🌿</Text>
      <View className="flex-1">
        <Text
          className="text-base text-white"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {plant.name}
        </Text>
        <Text className="text-xs text-white/50 mt-0.5">
          {pipe(
            [plant.scientificName, plant.category],
            Arr.map(Option.fromNullable),
            Arr.getSomes,
            Arr.join(' · ')
          )}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="white" />
      ) : (
        <MaterialIcons name="add-circle-outline" size={24} color="white" />
      )}
    </Pressable>
  )
})

export function AddPlantStep({
  onScan,
  onPlantAdded,
  onSkip,
}: AddPlantStepProps) {
  const { t } = useTranslation('onboarding')
  const { isDark } = useThemeContext()
  const insets = useSafeAreaInsets()
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

  const handleSelectPlant = useCallback(
    async (plant: CatalogPlant) => {
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
        // Fall through
      } finally {
        setAddingPlantId(null)
      }
    },
    [createPlant, onPlantAdded]
  )

  const renderItem = useCallback(
    ({ item }: { item: CatalogPlant }) => (
      <CatalogItem
        plant={item}
        onSelect={() => handleSelectPlant(item)}
        loading={addingPlantId === item.id}
      />
    ),
    [addingPlantId, handleSelectPlant]
  )

  if (showSearch) {
    return (
      <View className="flex-1">
        <View className="flex-row items-center px-6 pt-4 mb-4">
          <Pressable
            onPress={() => {
              setShowSearch(false)
              setSearchQuery('')
            }}
            className="mr-3"
          >
            <MaterialIcons name="arrow-back" size={24} color="white" />
          </Pressable>
          <Text
            className="text-lg text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('addPlant.addManually')}
          </Text>
        </View>

        <View
          className="flex-1 mx-4 rounded-3xl overflow-hidden"
          style={{ marginBottom: insets.bottom + 16 }}
        >
          <BlurView
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
            className="flex-1 p-4"
          >
            <TextInput
              className="bg-white/10 rounded-full px-5 py-3 text-base text-white mb-4"
              placeholder={t('addPlant.searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />

            <FlatList
              data={catalogPlants}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              className="flex-1"
              ListEmptyComponent={
                <View className="py-8 items-center">
                  <Text className="text-sm text-white/40">
                    {searchQuery
                      ? t('addPlant.noResults')
                      : t('addPlant.searchHint')}
                  </Text>
                </View>
              }
            />

            <Pressable onPress={onSkip} className="py-3 items-center">
              <Text
                className="text-sm text-white/40"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                {t('addPlant.skipLabel')}
              </Text>
            </Pressable>
          </BlurView>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-1">
      <OnboardingHero
        emoji="📸"
        title={t('addPlant.title')}
        subtitle={t('addPlant.subtitle')}
      />

      <GlassCard>
        <View className="gap-3">
          <Button icon="camera-alt" iconPosition="left" onPress={onScan} pill>
            {t('addPlant.scanCamera')}
          </Button>

          <Button
            variant="secondary"
            icon="search"
            iconPosition="left"
            onPress={() => setShowSearch(true)}
            pill
          >
            {t('addPlant.addManually')}
          </Button>
        </View>

        <Pressable onPress={onSkip} className="mt-4 py-2 items-center">
          <Text
            className="text-sm text-white/40"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('addPlant.skipLabel')}
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  )
}
