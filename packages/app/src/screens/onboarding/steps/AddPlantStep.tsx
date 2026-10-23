import { MaterialIcons } from '@expo/vector-icons'
import type { CatalogPlant } from '@lily/shared'
import { keepPreviousData } from '@tanstack/react-query'
import { Array as Arr, Option, pipe, Result } from 'effect'
import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import { GlassCard, GlassInput, GlassLink, MascotHero } from '@/components'
import { Button } from '@/components/ui/Button'
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

const CatalogItem = memo(function CatalogItem({
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
      accessibilityRole="button"
      className="flex-row items-center gap-3 py-3 px-1 border-b border-white/10 active:opacity-70"
    >
      <View className="w-10 h-10 rounded-full bg-white/15 border border-white/15 items-center justify-center">
        <MaterialIcons name="eco" size={20} color={iconColors.white} />
      </View>
      <View className="flex-1">
        <Text
          className="text-base text-white"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {plant.name}
        </Text>
        <Text
          className="text-xs text-white/70 mt-0.5"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {pipe(
            [plant.scientificName, plant.category],
            Arr.map(Option.fromNullishOr),
            Arr.getSomes,
            Arr.join(' · ')
          )}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={iconColors.white} />
      ) : (
        <MaterialIcons
          name="add-circle-outline"
          size={24}
          color={iconColors.white}
        />
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
      query: {
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
        if (Result.isSuccess(result)) {
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-row items-center gap-3 px-4 pt-2 mb-4">
          <Pressable
            testID="onboarding-search-back-button"
            accessibilityRole="button"
            accessibilityLabel={t('common:buttons.back')}
            hitSlop={8}
            onPress={() => {
              setShowSearch(false)
              setSearchQuery('')
            }}
            className="w-10 h-10 rounded-full items-center justify-center bg-white/15 border border-white/25 active:bg-white/25"
          >
            <MaterialIcons
              name="arrow-back"
              size={22}
              color={iconColors.white}
            />
          </Pressable>
          <Text
            className="flex-1 text-xl text-white"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            numberOfLines={1}
          >
            {t('addPlant.addManually')}
          </Text>
        </View>

        <GlassCard padding="sm" fill>
          <GlassInput
            testID="onboarding-search-input"
            icon="search"
            placeholder={t('addPlant.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
            autoFocus
          />

          <FlatList
            data={catalogPlants}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <View className="py-8 items-center">
                <Text
                  className="text-sm text-white/70 text-center"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  {searchQuery
                    ? t('addPlant.noResults')
                    : t('addPlant.searchHint')}
                </Text>
              </View>
            }
          />

          <GlassLink label={t('addPlant.skipLabel')} onPress={onSkip} />
        </GlassCard>
      </KeyboardAvoidingView>
    )
  }

  return (
    <View className="flex-1">
      <MascotHero
        animation="scan"
        title={t('addPlant.title')}
        subtitle={t('addPlant.subtitle')}
      />

      <GlassCard>
        <View className="gap-3">
          <Button icon="camera-alt" iconPosition="left" onPress={onScan} pill>
            {t('addPlant.scanCamera')}
          </Button>

          <Button
            variant="glass"
            icon="search"
            iconPosition="left"
            onPress={() => setShowSearch(true)}
            pill
          >
            {t('addPlant.addManually')}
          </Button>
        </View>

        <GlassLink label={t('addPlant.skipLabel')} onPress={onSkip} />
      </GlassCard>
    </View>
  )
}
