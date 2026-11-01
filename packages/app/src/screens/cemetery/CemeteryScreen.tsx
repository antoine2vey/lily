import { MaterialIcons } from '@expo/vector-icons'
import type { Plant } from '@lily/shared'
import { Array, Match, Option, pipe, Result } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useAuth } from '@/contexts/AuthContext'
import { useDeadPlants } from '@/hooks/useDeadPlants'
import { useDeletePlant } from '@/hooks/useDeletePlant'
import { useIconColors } from '@/hooks/useIconColors'
import { useMyCanopy } from '@/hooks/useMyCanopy'
import { useRevivePlant } from '@/hooks/useRevivePlant'
import { CemeteryPlantCard } from '@/screens/cemetery/components/CemeteryPlantCard'
import { plantActionsFor, plantRoleFor } from '@/utils/canopy-plants'
import { showPlantLimitAlert } from '@/utils/plant-limit-alert'

export function CemeteryScreen() {
  const { t } = useTranslation('cemetery')
  const { t: tPlants } = useTranslation('plants')
  const { t: tCommon } = useTranslation('common')
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { plants, isLoading } = useDeadPlants()
  const revivePlant = useRevivePlant()
  const deletePlant = useDeletePlant()
  const [deleting, setDeleting] = useState<Plant | null>(null)
  const { state: authState } = useAuth()
  const me = authState._tag === 'Authenticated' ? authState.user.id : ''
  const { data: canopyData } = useMyCanopy()
  const canopyRole = Option.getOrNull(
    Option.map(Option.fromNullishOr(canopyData?.canopy), (c) => c.role)
  )
  const inCanopy = canopyRole !== null

  const handlePress = useCallback(
    (plantId: string) => router.push(`/plant/${plantId}`),
    [router]
  )

  const handleBringBack = useCallback(
    async (plant: Plant) => {
      const result = await revivePlant.mutateAsync({ params: { id: plant.id } })
      pipe(
        result,
        Result.match({
          onFailure: (error) =>
            pipe(
              Match.value(error),
              Match.when({ _tag: 'LimitExceededError' }, (e) =>
                showPlantLimitAlert(e, t('limit.title'), t)
              ),
              Match.orElse(() => toast.error(t('toast.bringBackFailed')))
            ),
          onSuccess: () =>
            toast.success(t('toast.broughtBack', { name: plant.name })),
        })
      )
    },
    [revivePlant, t]
  )

  // useEffectMutation resolves an API failure as Result.fail, so onSuccess
  // runs for a refused delete too: the toast must follow the Result.
  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return
    const name = deleting.name
    const result = await deletePlant.mutateAsync({
      params: { id: deleting.id },
    })
    setDeleting(null)
    Result.match(result, {
      onFailure: () => toast.error(tPlants('detail.toast.deleteFailed')),
      onSuccess: () => toast.success(tPlants('detail.toast.deleted', { name })),
    })
  }, [deleting, deletePlant, tPlants])

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
      testID="cemetery-screen"
    >
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <GlassBackButton />
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('title')}
        </Text>
        <View className="w-10 h-10" />
      </View>

      {isLoading &&
      Array.isReadonlyArrayEmpty(plants) ? null : Array.isReadonlyArrayEmpty(
          plants
        ) ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <EmptyState kind="cemetery" />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <FlatList
            data={plants}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item }) => {
              const actions = plantActionsFor(
                plantRoleFor(item, me, canopyRole),
                inCanopy
              )
              return (
                <CemeteryPlantCard
                  plant={item}
                  isReviving={revivePlant.isPending}
                  canBringBack={actions.endLife}
                  canDelete={actions.delete}
                  onPress={handlePress}
                  onBringBack={handleBringBack}
                  onDelete={setDeleting}
                />
              )
            }}
          />
        </Animated.View>
      )}

      <ConfirmationModal
        visible={deleting !== null}
        title={tPlants('detail.delete.title', {
          name: Option.getOrElse(
            Option.map(Option.fromNullishOr(deleting), (p) => p.name),
            () => ''
          ),
        })}
        message={tPlants('detail.delete.message')}
        confirmLabel={
          deletePlant.isPending
            ? tCommon('loading.deleting')
            : tPlants('detail.delete.confirm')
        }
        cancelLabel={tPlants('detail.delete.cancel')}
        destructive
        icon={
          <MaterialIcons name="delete" size={32} color={iconColors.coral} />
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </View>
  )
}
