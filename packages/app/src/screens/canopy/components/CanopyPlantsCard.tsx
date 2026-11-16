import { MaterialIcons } from '@expo/vector-icons'
import type { Canopy, Plant } from '@lily/shared'
import { Array as Arr, Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { toast } from 'sonner-native'
import { Avatar } from '@/components/Avatar'
import {
  useSharePlantWithCanopy,
  useUnsharePlant,
} from '@/hooks/usePlantCanopyActions'
import { usePlants } from '@/hooks/usePlants'
import { CanopySection } from '@/screens/canopy/components/CanopySection'
import { actionsOnPlant } from '@/utils/canopy-plants'
import type { ApiFailure } from '@/utils/client'

interface CanopyPlantsCardProps {
  canopy: Canopy
  myUserId: string
}

const toastFailure = (error: ApiFailure, t: TFunction) =>
  pipe(
    Match.value(error),
    Match.tag('LimitExceededError', (e) =>
      e.feature === 'canopy_plants'
        ? toast.warning(t('detail.plants.limit'))
        : toast.warning(e.message)
    ),
    Match.tag('PlantInDelegationError', () =>
      toast.warning(t('detail.plants.delegated'))
    ),
    Match.orElse(() => toast.error(t('detail.plants.failed')))
  )

export function CanopyPlantsCard({ canopy, myUserId }: CanopyPlantsCardProps) {
  const { t } = useTranslation('canopy')
  const { data } = usePlants({ limit: '100' })
  const share = useSharePlantWithCanopy()
  const unshare = useUnsharePlant()
  const [pending, setPending] = useState<ReadonlyArray<string>>([])

  const plants = pipe(
    Option.fromNullishOr(data?.items),
    Option.getOrElse((): ReadonlyArray<Plant> => []),
    Arr.filter((plant) => {
      const actions = actionsOnPlant(
        plant,
        myUserId,
        Option.some({ role: canopy.role, members: canopy.members })
      )
      return actions.shareToCanopy || actions.unshare
    })
  )

  if (Arr.isReadonlyArrayEmpty(plants)) return null

  const isShared = (plant: Plant) => plant.ownership === 'canopy'

  // Per-call mutate callbacks fire for the latest call only, so two plants
  // in flight at once each need their own promise.
  const toggle = (plant: Plant) => {
    setPending((prev) => [...prev, plant.id])
    const mutation = isShared(plant) ? unshare : share
    mutation
      .mutateAsync(plant.id)
      .catch((error: ApiFailure) => toastFailure(error, t))
      .finally(() =>
        setPending((prev) => Arr.filter(prev, (id) => id !== plant.id))
      )
  }

  return (
    <CanopySection
      title={t('detail.plants.title')}
      aside={t('detail.plants.count', {
        shared: Arr.filter(plants, isShared).length,
        total: plants.length,
      })}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="p-3 gap-2"
        testID="canopy-plants-card"
      >
        {Arr.map(plants, (plant) => (
          <PlantTile
            key={plant.id}
            plant={plant}
            shared={isShared(plant)}
            busy={Arr.contains(pending, plant.id)}
            onPress={() => toggle(plant)}
          />
        ))}
      </ScrollView>
    </CanopySection>
  )
}

interface PlantTileProps {
  plant: Plant
  shared: boolean
  busy: boolean
  onPress: () => void
}

function PlantTile({ plant, shared, busy, onPress }: PlantTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: shared, busy }}
      accessibilityLabel={plant.name}
      className={`w-20 items-center px-1 py-2 gap-1.5 rounded-xl border-2 ${
        shared
          ? 'border-primary/50 bg-primary-tint dark:bg-primary/10'
          : 'border-transparent'
      }`}
      testID={`canopy-plant-toggle-${plant.id}`}
    >
      <View>
        <Avatar
          source={pipe(
            Option.fromNullishOr(plant.imageUrl),
            Option.map((uri) => ({ uri })),
            Option.getOrUndefined
          )}
          name={plant.name}
          size="lg"
        />
        {busy && (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-black/30">
            <ActivityIndicator size="small" color="white" />
          </View>
        )}
        {shared && (
          <View className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full items-center justify-center bg-primary border-2 border-surface dark:border-surface-dark">
            <MaterialIcons name="check" size={12} color="white" />
          </View>
        )}
      </View>
      <Text
        className="text-xs text-center text-text-primary dark:text-white"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        numberOfLines={1}
      >
        {plant.name}
      </Text>
    </Pressable>
  )
}
