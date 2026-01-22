import { MaterialIcons } from '@expo/vector-icons'
import type { CareTaskType } from '@lily/shared'
import { Match, Option, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'
import { Badge } from 'src/components/Badge'
import { iconColors } from 'src/theme'
import { UndoButton } from './UndoButton'

interface CareTaskCardProps {
  task: {
    id: string
    plantId: string
    plantName: string
    plantImageUrl: string | null
    type: CareTaskType
    completed: boolean
    dueDate: Date
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
  label: string
}

const getTaskConfig = (type: CareTaskType): TaskConfig =>
  pipe(
    Match.value(type),
    Match.when('water', () => ({
      icon: 'water-drop' as const,
      color: iconColors.waterBlue,
      label: 'WATER',
    })),
    Match.when('fertilize', () => ({
      icon: 'eco' as const,
      color: iconColors.fertilizerOrange,
      label: 'FERTILIZE',
    })),
    Match.exhaustive
  )

export function CareTaskCard({
  task,
  onCardPress,
  onPlantPhotoPress,
  onUndo,
  overdue = false,
  compact = false,
  isPendingCompletion = false,
}: CareTaskCardProps) {
  const config = getTaskConfig(task.type)

  const containerClass = pipe(
    Match.value({ overdue, isPendingCompletion }),
    Match.when(
      { isPendingCompletion: true },
      () => 'flex-row items-center p-3 rounded-xl mb-2 border border-primary'
    ),
    Match.when(
      { overdue: true },
      () =>
        'flex-row items-center p-3 rounded-xl mb-2 bg-surface border border-coral active:opacity-90'
    ),
    Match.orElse(
      () =>
        'flex-row items-center p-3 rounded-xl mb-2 bg-surface active:opacity-90'
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
        <Image
          source={{ uri: imageUri }}
          className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-border`}
        />
      </Pressable>
      <View className="flex-1 ml-3">
        <Text
          className={`${compact ? 'text-sm' : 'text-base'} font-medium text-text-primary`}
          numberOfLines={1}
        >
          {task.plantName}
        </Text>
        <View className="flex-row items-center mt-1">
          <Badge
            label={config.label}
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
