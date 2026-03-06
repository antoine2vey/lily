import { MaterialIcons } from '@expo/vector-icons'
import type { CareTask } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { useCompleteTask } from '@/hooks/useCompleteTask'
import { useIconColors } from '@/hooks/useIconColors'

interface CareAgendaCardProps {
  overdue: ReadonlyArray<CareTask>
  today: ReadonlyArray<CareTask>
}

interface TaskChipProps {
  task: CareTask
  isOverdue: boolean
  isCompleting: boolean
  onPress: () => void
  iconColors: ReturnType<typeof useIconColors>
}

function TaskChip({
  task,
  isOverdue,
  isCompleting,
  onPress,
  iconColors,
}: TaskChipProps) {
  const { t } = useTranslation('home')
  const isDark = iconColors.isDark

  const taskColor =
    task.type === 'water' ? iconColors.waterBlue : iconColors.warning
  const taskBgColor = pipe(
    Match.value(task.type),
    Match.when('water', () => (isDark ? 'rgba(96,165,250,0.15)' : '#EFF6FF')),
    Match.orElse(() => (isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'))
  )
  const taskIcon = task.type === 'water' ? 'water-drop' : 'science'

  return (
    <Pressable
      onPress={onPress}
      disabled={isCompleting}
      className={`flex-row items-center gap-3 p-3 rounded-2xl mb-2 ${isCompleting ? 'opacity-50' : ''}`}
      style={{
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      }}
      accessibilityLabel={`${task.type === 'water' ? t('tasks.water') : t('tasks.fertilize')} ${task.plantName}`}
      accessibilityRole="button"
    >
      {/* Plant image */}
      <View
        className="w-9 h-9 rounded-full overflow-hidden items-center justify-center shrink-0"
        style={{
          backgroundColor: isDark ? '#2D3728' : '#E8F5E8',
          borderWidth: 2,
          borderColor: isDark ? '#374151' : 'white',
        }}
      >
        {pipe(
          Option.fromNullable(task.plantImageUrl),
          Option.match({
            onSome: (url) => (
              <AnimatedImage
                source={{ uri: url }}
                className="w-full h-full"
                rounded
                fallback={
                  <MaterialIcons
                    name="eco"
                    size={18}
                    color={iconColors.primary}
                  />
                }
              />
            ),
            onNone: () => (
              <MaterialIcons name="eco" size={18} color={iconColors.primary} />
            ),
          })
        )}
      </View>

      {/* Plant name + overdue badge */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm font-semibold text-text-primary dark:text-white"
          numberOfLines={1}
        >
          {task.plantName}
        </Text>
        {isOverdue && (
          <Text className="text-[10px] font-bold text-coral uppercase tracking-wide">
            {t('careAgenda.overdueLabel')}
          </Text>
        )}
      </View>

      {/* Task type icon */}
      <View
        className="w-8 h-8 rounded-full items-center justify-center shrink-0"
        style={{ backgroundColor: taskBgColor }}
      >
        {isCompleting ? (
          <MaterialIcons name="check-circle" size={16} color={taskColor} />
        ) : (
          <MaterialIcons name={taskIcon} size={16} color={taskColor} />
        )}
      </View>
    </Pressable>
  )
}

export function CareAgendaCard({ overdue, today }: CareAgendaCardProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const { mutate: completeTask } = useCompleteTask()

  const allTasks = useMemo(
    () => Array.appendAll(overdue, today),
    [overdue, today]
  )
  const overdueIds = useMemo(
    () => new Set(Array.map(overdue, (t) => t.id)),
    [overdue]
  )
  const taskCount = Array.length(allTasks)
  const isEmpty = taskCount === 0

  const handleTaskPress = (task: CareTask) => {
    if (completingTaskId !== null) return
    setCompletingTaskId(task.id)
    completeTask(
      { taskId: task.id, plantId: task.plantId, type: task.type },
      { onSettled: () => setCompletingTaskId(null) }
    )
  }

  return (
    <View
      className="rounded-[32px] p-6 bg-surface dark:bg-surface-dark"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.06,
        shadowRadius: 20,
        elevation: 4,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-xl font-bold mb-0.5 text-text-primary dark:text-white">
            {t('careAgenda.title')}
          </Text>
          {!isEmpty && (
            <Text className="text-sm font-medium text-text-secondary dark:text-text-muted">
              {t('careAgenda.xTasks', { count: taskCount })}
            </Text>
          )}
        </View>
        <View
          className="p-2 rounded-full"
          style={{
            backgroundColor: isDark
              ? 'rgba(155, 199, 109, 0.2)'
              : 'rgba(255, 255, 255, 0.6)',
          }}
        >
          <MaterialIcons name="task-alt" size={24} color={iconColors.primary} />
        </View>
      </View>

      {isEmpty ? (
        /* All done empty state */
        <View className="items-center py-4 gap-2">
          <View
            className="w-14 h-14 rounded-full items-center justify-center mb-1"
            style={{
              backgroundColor: isDark
                ? 'rgba(155, 199, 109, 0.2)'
                : 'rgba(91, 140, 90, 0.12)',
            }}
          >
            <MaterialIcons
              name="check-circle"
              size={32}
              color={iconColors.primary}
            />
          </View>
          <Text className="text-base font-bold text-text-primary dark:text-white">
            {t('careAgenda.allDone')}
          </Text>
          <Text className="text-sm font-medium text-text-secondary dark:text-text-muted">
            {t('careAgenda.allDoneSubtitle')}
          </Text>
        </View>
      ) : (
        /* Task list */
        <View>
          {pipe(
            allTasks,
            Array.map((task) => (
              <TaskChip
                key={task.id}
                task={task}
                isOverdue={overdueIds.has(task.id)}
                isCompleting={completingTaskId === task.id}
                onPress={() => handleTaskPress(task)}
                iconColors={iconColors}
              />
            ))
          )}
        </View>
      )}
    </View>
  )
}
