import { MaterialIcons } from '@expo/vector-icons'
import type { CareType } from '@lily/shared'
import { Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { Badge } from 'src/components/Badge'
import { useIconColors } from 'src/hooks/useIconColors'
import { UndoButton } from 'src/screens/care/components/UndoButton'

interface CareTaskCardProps {
  task: {
    id: string
    plantId: string
    plantName: string
    plantImageUrl: string | null
    type: CareType
    completed: boolean
    dueDate: Date
    roomName?: string | null
    roomIcon?: string | null
  }
  onCardPress: () => void
  onPlantPhotoPress: () => void
  onUndo?: () => void
  overdue?: boolean
  compact?: boolean
  isPendingCompletion?: boolean
}

interface TaskConfig {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  labelKey: CareType
}

const getTaskConfig = (
  type: CareType,
  iconColors: ReturnType<typeof useIconColors>
): TaskConfig =>
  pipe(
    Match.value(type),
    Match.when('watering', () => ({
      icon: 'water-drop' as const,
      color: iconColors.waterBlue,
      labelKey: 'watering' as const,
    })),
    Match.when('fertilization', () => ({
      icon: 'eco' as const,
      color: iconColors.fertilizerOrange,
      labelKey: 'fertilization' as const,
    })),
    Match.when('misting', () => ({
      icon: 'grain' as const,
      color: iconColors.waterBlue,
      labelKey: 'misting' as const,
    })),
    Match.when('repotting', () => ({
      icon: 'compost' as const,
      color: iconColors.repotBrown,
      labelKey: 'repotting' as const,
    })),
    Match.exhaustive
  )

const getTaskBadgeLabel = (
  labelKey: TaskConfig['labelKey'],
  t: TFunction
): string => t(`types.${labelKey}.badge`)

export function CareTaskCard({
  task,
  onCardPress,
  onPlantPhotoPress,
  onUndo,
  overdue = false,
  compact = false,
  isPendingCompletion = false,
}: CareTaskCardProps) {
  const { t } = useTranslation('care')
  const iconColors = useIconColors()
  const config = getTaskConfig(task.type, iconColors)

  const containerClass = pipe(
    Match.value({ overdue, isPendingCompletion }),
    Match.when(
      { isPendingCompletion: true },
      () => 'flex-row items-center p-3 rounded-xl mb-2 border border-primary'
    ),
    Match.when(
      { overdue: true },
      () =>
        'flex-row items-center p-3 rounded-xl mb-2 bg-surface dark:bg-surface-dark border border-coral active:opacity-90'
    ),
    Match.orElse(
      () =>
        'flex-row items-center p-3 rounded-xl mb-2 bg-surface dark:bg-surface-dark active:opacity-90'
    )
  )

  const imageUri = pipe(
    Option.fromNullable(task.plantImageUrl),
    Option.getOrUndefined
  )

  const isCompleted = task.completed || isPendingCompletion

  return (
    <Pressable
      onPress={isPendingCompletion ? undefined : onCardPress}
      className={containerClass}
      disabled={isPendingCompletion}
    >
      <Pressable
        onPress={(e) => {
          e.stopPropagation()
          onPlantPhotoPress()
        }}
        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
      >
        <AnimatedImage
          source={{ uri: imageUri }}
          className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} bg-border`}
          rounded
        />
      </Pressable>
      <View className="flex-1 ml-3">
        <View className="flex-row items-center gap-1.5">
          <Text
            className={`${compact ? 'text-sm' : 'text-base'} font-medium text-text-primary dark:text-white`}
            numberOfLines={1}
          >
            {task.plantName}
          </Text>
          {task.roomName && (
            <View className="flex-row items-center gap-0.5">
              <Text className="text-xs">{task.roomIcon}</Text>
              <Text className="text-xs text-text-muted dark:text-slate-400">
                {task.roomName}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center mt-1">
          <Badge
            label={getTaskBadgeLabel(config.labelKey, t)}
            variant={overdue ? 'error' : 'info'}
            size="sm"
            icon={
              <MaterialIcons
                name={config.icon}
                size={10}
                color={overdue ? iconColors.coral : config.color}
              />
            }
          />
        </View>
      </View>
      {isPendingCompletion && onUndo ? (
        <UndoButton onUndo={onUndo} />
      ) : (
        <View className="w-10 h-10 items-center justify-center">
          <MaterialIcons
            name={isCompleted ? 'check-circle' : 'radio-button-unchecked'}
            size={28}
            color={isCompleted ? iconColors.primary : iconColors.border}
          />
        </View>
      )}
    </Pressable>
  )
}
