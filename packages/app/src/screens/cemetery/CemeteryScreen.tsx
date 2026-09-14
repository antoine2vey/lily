import { MaterialIcons } from '@expo/vector-icons'
import type { Plant } from '@lily/shared'
import { Array, Either, Match, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, FlatList, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useDeadPlants } from '@/hooks/useDeadPlants'
import { useDeletePlant } from '@/hooks/useDeletePlant'
import { useIconColors } from '@/hooks/useIconColors'
import { useRevivePlant } from '@/hooks/useRevivePlant'
import { CemeteryPlantCard } from '@/screens/cemetery/components/CemeteryPlantCard'

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

  const handlePress = useCallback(
    (plantId: string) => router.push(`/plant/${plantId}`),
    [router]
  )

  const handleBringBack = useCallback(
    async (plant: Plant) => {
      const result = await revivePlant.mutateAsync({ path: { id: plant.id } })
      pipe(
        result,
        Either.match({
          onLeft: (error) =>
            pipe(
              Match.value(error),
              Match.when({ _tag: 'LimitExceededError' }, (e) =>
                Alert.alert(t('limit.title'), e.message)
              ),
              Match.orElse(() => toast.error(t('toast.bringBackFailed')))
            ),
          onRight: () =>
            toast.success(t('toast.broughtBack', { name: plant.name })),
        })
      )
    },
    [revivePlant, t]
  )

  const handleConfirmDelete = useCallback(() => {
    if (!deleting) return
    const name = deleting.name
    deletePlant.mutate(
      { path: { id: deleting.id } },
      {
        onSuccess: () => {
          setDeleting(null)
          toast.success(tPlants('detail.toast.deleted', { name }))
        },
        onError: () => {
          setDeleting(null)
          toast.error(tPlants('detail.toast.deleteFailed'))
        },
      }
    )
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
      Array.isEmptyReadonlyArray(plants) ? null : Array.isEmptyReadonlyArray(
          plants
        ) ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <EmptyState
            title={t('empty.title')}
            description={t('empty.description')}
          />
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
            renderItem={({ item }) => (
              <CemeteryPlantCard
                plant={item}
                isReviving={revivePlant.isPending}
                onPress={handlePress}
                onBringBack={handleBringBack}
                onDelete={setDeleting}
              />
            )}
          />
        </Animated.View>
      )}

      <ConfirmationModal
        visible={deleting !== null}
        title={tPlants('detail.delete.title', {
          name: Option.getOrElse(
            Option.map(Option.fromNullable(deleting), (p) => p.name),
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
