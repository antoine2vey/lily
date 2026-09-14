import { MaterialIcons } from '@expo/vector-icons'
import { formatLongDate, type Plant } from '@lily/shared'
import { DateTime, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { Chip } from '@/components/Chip'
import { useIconColors } from '@/hooks/useIconColors'
import { buildLivedWithYouLabel } from '@/screens/plant-detail/plantAge'

interface CemeteryPlantCardProps {
  plant: Plant
  isReviving?: boolean | undefined
  onPress: (plantId: string) => void
  onBringBack: (plant: Plant) => void
  onDelete: (plant: Plant) => void
}

export function CemeteryPlantCard({
  plant,
  isReviving = false,
  onPress,
  onBringBack,
  onDelete,
}: CemeteryPlantCardProps) {
  const { t, i18n } = useTranslation('cemetery')
  const { t: tDetail } = useTranslation('plantDetail')
  const iconColors = useIconColors()

  const diedAtOpt = Option.fromNullable(plant.diedAt)
  const livedFor = pipe(
    diedAtOpt,
    Option.map((diedAt) =>
      buildLivedWithYouLabel(plant.dateAdded, diedAt, t, tDetail)
    ),
    Option.getOrElse(() => '')
  )
  const diedOn = pipe(
    diedAtOpt,
    Option.flatMap((d) => DateTime.make(d)),
    Option.map((dt) =>
      t('diedOn', { date: formatLongDate(dt, i18n.language) })
    ),
    Option.getOrElse(() => '')
  )

  return (
    <Pressable
      onPress={() => onPress(plant.id)}
      className="mb-3 rounded-2xl p-4 bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 active:opacity-90"
      testID={`cemetery-plant-${plant.id}`}
    >
      <View className="flex-row gap-4">
        {plant.imageUrl ? (
          <AnimatedImage
            source={{ uri: plant.imageUrl }}
            className="w-20 h-20 rounded-xl"
          />
        ) : (
          <View className="w-20 h-20 rounded-xl items-center justify-center bg-surface-tinted dark:bg-slate-800">
            <MaterialIcons
              name="local-florist"
              size={28}
              color={iconColors.textMuted}
            />
          </View>
        )}
        <View className="flex-1">
          <Text
            className="text-base font-bold text-text-primary dark:text-white"
            numberOfLines={1}
          >
            {plant.name}
          </Text>
          {plant.category && (
            <Text
              className="text-sm font-regular text-primary dark:text-primary-light"
              numberOfLines={1}
            >
              {plant.category}
            </Text>
          )}
          <Text className="mt-1 text-sm font-medium text-text-secondary dark:text-slate-300">
            {livedFor}
          </Text>
          <Text className="text-xs font-regular text-text-muted dark:text-slate-400">
            {diedOn}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-4">
        {plant.deathCause ? (
          <Chip
            label={t(`causes.${plant.deathCause}`)}
            variant="input"
            disabled
          />
        ) : (
          <View />
        )}
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onBringBack(plant)}
            disabled={isReviving}
            className="flex-row items-center gap-1 px-3 py-2 rounded-full bg-primary-tint dark:bg-primary/20 active:opacity-80"
            testID={`cemetery-bring-back-${plant.id}`}
          >
            <MaterialIcons
              name="restore"
              size={16}
              color={iconColors.primary}
            />
            <Text className="text-sm font-semibold text-primary dark:text-primary-light">
              {t('actions.bringBack')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(plant)}
            className="w-9 h-9 rounded-full items-center justify-center bg-surface-tinted dark:bg-slate-800 active:opacity-80"
            accessibilityLabel={t('actions.deletePermanently')}
            testID={`cemetery-delete-${plant.id}`}
          >
            <MaterialIcons
              name="delete-outline"
              size={18}
              color={iconColors.coral}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}
