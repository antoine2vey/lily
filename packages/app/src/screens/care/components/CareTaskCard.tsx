import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'
import { Badge } from 'src/components/Badge'
import { iconColors } from 'src/theme'

type CareTaskType = 'water' | 'fertilize' | 'prune' | 'rotate' | 'mist'

interface CareTaskCardProps {
  task: {
    id: string
    plantId: string
    plantName: string
    plantImageUrl?: string
    type: CareTaskType
    completed: boolean
  }
  onPress: () => void
  onComplete: () => void
  overdue?: boolean
  compact?: boolean
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
    Match.when('prune', () => ({
      icon: 'content-cut' as const,
      color: iconColors.pruneRed,
      label: 'PRUNE',
    })),
    Match.when('rotate', () => ({
      icon: 'rotate-right' as const,
      color: '#9C27B0',
      label: 'ROTATE',
    })),
    Match.when('mist', () => ({
      icon: 'cloud' as const,
      color: iconColors.mistTeal,
      label: 'MIST',
    })),
    Match.exhaustive
  )

export function CareTaskCard({
  task,
  onPress,
  onComplete,
  overdue = false,
  compact = false,
}: CareTaskCardProps) {
  const config = getTaskConfig(task.type)

  const containerClass = overdue
    ? 'flex-row items-center p-3 rounded-xl mb-2 bg-surface border border-coral active:opacity-90'
    : 'flex-row items-center p-3 rounded-xl mb-2 bg-surface active:opacity-90'

  return (
    <Pressable onPress={onPress} className={containerClass}>
      <Image
        source={{ uri: task.plantImageUrl }}
        className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-border`}
      />
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
      <Pressable
        onPress={(e) => {
          e.stopPropagation()
          onComplete()
        }}
        className="w-10 h-10 items-center justify-center"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialIcons
          name={task.completed ? 'check-circle' : 'radio-button-unchecked'}
          size={28}
          color={task.completed ? iconColors.primary : iconColors.border}
        />
      </Pressable>
    </Pressable>
  )
}
