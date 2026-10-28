import { useQueryClient } from '@tanstack/react-query'
import { Array as Arr, Effect, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { EmptyState } from '@/components/EmptyState'
import { SelectablePlantRow } from '@/components/SelectablePlantRow'
import { PlantSelectorSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui'
import { refreshOwnedData } from '@/hooks/useCanopyMutations'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { usePlants } from '@/hooks/usePlants'
import { runApiEffect } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

const shareOne = (plantId: string) =>
  Effect.promise(() =>
    runApiEffect('plants', 'sharePlantWithCanopy', {
      params: { id: plantId },
      payload: {},
    })
  )

/** Shown once, right after joining: every personal plant starts unticked. */
export function BringPlantsScreen({ canopyName }: { canopyName: string }) {
  const { t } = useTranslation('canopy')
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { data, isLoading } = usePlants({ limit: '100' })
  const [selected, setSelected] = useState<ReadonlyArray<string>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const plants = pipe(
    Option.fromNullishOr(data?.items),
    Option.getOrElse((): NonNullable<typeof data>['items'] => [])
  )
  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)
  const allSelected =
    Arr.isReadonlyArrayNonEmpty(plants) && selected.length === plants.length

  const toggle = (plantId: string) =>
    setSelected((prev) =>
      Arr.contains(prev, plantId)
        ? Arr.filter(prev, (id) => id !== plantId)
        : [...prev, plantId]
    )

  const finish = async () => {
    setIsSubmitting(true)
    const results = await Effect.runPromise(Effect.forEach(selected, shareOne))
    const shared = Arr.getSuccesses(results)
    const failures = Arr.getFailures(results)
    refreshOwnedData(queryClient)
    queryClient.invalidateQueries({ queryKey: queryKeys.canopy.all })

    toast.success(t('bring.joined', { name: canopyName }), {
      ...(Arr.isArrayNonEmpty(shared)
        ? { description: t('bring.brought', { count: shared.length }) }
        : {}),
    })
    if (Arr.some(failures, (error) => error._tag === 'LimitExceededError')) {
      toast.warning(t('bring.limit'))
    } else if (
      Arr.some(failures, (error) => error._tag === 'PlantInDelegationError')
    ) {
      toast.warning(t('bring.delegated'))
    } else if (Arr.isArrayNonEmpty(failures)) {
      toast.error(t('bring.failed'))
    }
    router.replace('/canopy')
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <View className="px-6 pt-6 pb-4 gap-2">
        <Text
          className="text-2xl text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          {t('bring.title')}
        </Text>
        <Text className="text-sm leading-relaxed text-text-secondary dark:text-slate-400">
          {t('bring.description', { name: canopyName })}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {showSkeleton ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <PlantSelectorSkeleton />
          </Animated.View>
        ) : isInitialLoading ? null : Arr.isReadonlyArrayEmpty(plants) ? (
          <EmptyState kind="canopyBringPlants" variant="inline" />
        ) : (
          <Animated.View entering={FadeIn.duration(300)} className="gap-2">
            <View className="flex-row items-center justify-between ml-1 mb-1">
              <Text
                className="text-sm text-text-secondary dark:text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('bring.count', {
                  selected: selected.length,
                  total: plants.length,
                })}
              </Text>
              <Pressable
                onPress={() =>
                  setSelected(allSelected ? [] : Arr.map(plants, (p) => p.id))
                }
                hitSlop={8}
              >
                <Text className="text-sm text-primary font-medium">
                  {allSelected ? t('bring.deselectAll') : t('bring.selectAll')}
                </Text>
              </Pressable>
            </View>
            {Arr.map(plants, (plant) => (
              <SelectablePlantRow
                key={plant.id}
                plant={plant}
                selected={Arr.contains(selected, plant.id)}
                onToggle={toggle}
              />
            ))}
          </Animated.View>
        )}
      </ScrollView>

      <View className="px-6 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button
          pill
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={finish}
          testID="canopy-bring-submit"
        >
          {t('bring.submit', { count: selected.length })}
        </Button>
      </View>
    </View>
  )
}
