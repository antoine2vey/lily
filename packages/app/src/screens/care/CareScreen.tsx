import { MaterialIcons } from '@expo/vector-icons'
import {
  CARE_TASK_UNDO_TIMEOUT_MS,
  type CareTask,
  type CareTaskType,
  daysUntil,
  formatDateHeader,
  formatDayOfWeek,
  parseApiDate,
} from '@lily/shared'
import { Array, DateTime, Match, Option, pipe, Record } from 'effect'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { SectionHeader } from 'src/components/SectionHeader'
import { CareScreenSkeleton } from 'src/components/skeletons'
import { useCareTasks } from 'src/hooks/useCareTasks'
import { useCompleteTask } from 'src/hooks/useCompleteTask'
import { useIconColors } from 'src/hooks/useIconColors'
import { CareTaskCard } from './components/CareTaskCard'

type TaskSectionType = 'overdue' | 'today' | 'thisWeek'

interface FutureTaskModalState {
  visible: boolean
  task: CareTask | null
  daysUntilDue: number
}

const formatDate = (dateTime: DateTime.DateTime): string =>
  formatDateHeader(dateTime)

const formatWeekday = (date: Date): string =>
  pipe(
    parseApiDate(date),
    Option.map(formatDayOfWeek),
    Option.getOrElse(() => 'Unknown')
  )

const calculateDaysUntilDue = (dueDate: Date): number =>
  pipe(
    parseApiDate(dueDate),
    Option.map(daysUntil),
    Option.getOrElse(() => 0)
  )

const getTaskActionLabel = (type: CareTaskType): string =>
  pipe(
    Match.value(type),
    Match.when('water', () => 'watered'),
    Match.when('fertilize', () => 'fertilized'),
    Match.exhaustive
  )

export function CareScreen() {
  const iconColors = useIconColors()
  const { data: tasks, isLoading } = useCareTasks()
  const { mutate: completeTask } = useCompleteTask()
  const today = DateTime.unsafeNow()

  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set())
  const pendingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  const [futureTaskModal, setFutureTaskModal] = useState<FutureTaskModalState>({
    visible: false,
    task: null,
    daysUntilDue: 0,
  })

  const handlePlantPhotoPress = (plantId: string) => {
    router.push(`/plant/${plantId}`)
  }

  const handleCompleteTaskApi = (
    taskId: string,
    plantId: string,
    type: CareTaskType
  ) => {
    completeTask({ taskId, plantId, type })
  }

  const handleUndo = (taskId: string) => {
    const timeout = pendingTimeouts.current.get(taskId)
    if (timeout) {
      clearTimeout(timeout)
      pendingTimeouts.current.delete(taskId)
    }
    setPendingTaskIds((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }

  const handleImmediateComplete = (task: CareTask) => {
    // Add to pending (shows undo button on card)
    setPendingTaskIds((prev) => new Set(prev).add(task.id))

    // Set timeout to actually call API after the undo timeout
    const timeoutId = setTimeout(() => {
      handleCompleteTaskApi(task.id, task.plantId, task.type)
      toast.success(`${task.plantName} ${getTaskActionLabel(task.type)}!`)
      pendingTimeouts.current.delete(task.id)
      setPendingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }, CARE_TASK_UNDO_TIMEOUT_MS)
    pendingTimeouts.current.set(task.id, timeoutId)
  }

  const handleCardPress = (task: CareTask, section: TaskSectionType) => {
    pipe(
      Match.value(section),
      Match.when('thisWeek', () => {
        setFutureTaskModal({
          visible: true,
          task,
          daysUntilDue: calculateDaysUntilDue(task.dueDate),
        })
      }),
      Match.when('overdue', () => handleImmediateComplete(task)),
      Match.when('today', () => handleImmediateComplete(task)),
      Match.exhaustive
    )
  }

  const handleConfirmFutureTask = () => {
    if (futureTaskModal.task) {
      handleCompleteTaskApi(
        futureTaskModal.task.id,
        futureTaskModal.task.plantId,
        futureTaskModal.task.type
      )
    }
    setFutureTaskModal({ visible: false, task: null, daysUntilDue: 0 })
  }

  const handleCancelFutureTask = () => {
    setFutureTaskModal({ visible: false, task: null, daysUntilDue: 0 })
  }

  if (isLoading) {
    return <CareScreenSkeleton />
  }

  const overdueCount = tasks?.overdue.length ?? 0
  const todayCount = tasks?.today.length ?? 0
  const thisWeekCount = tasks?.thisWeek.length ?? 0
  const totalTasks = overdueCount + todayCount + thisWeekCount

  return (
    <SafeAreaView
      edges={['top']}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header */}
      <View className="px-6 pt-2 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase font-medium text-text-muted dark:text-slate-400">
              Today, {formatDate(today)}
            </Text>
            <Text className="text-3xl mt-1 font-bold text-text-primary dark:text-white">
              Care
            </Text>
          </View>
          <Pressable className="w-10 h-10 rounded-full items-center justify-center bg-surface dark:bg-surface-dark">
            <MaterialIcons
              name="calendar-today"
              size={22}
              color={iconColors.textPrimary}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6 mb-10"
        showsVerticalScrollIndicator={false}
      >
        {totalTasks === 0 && (
          <View className="items-center py-12">
            <MaterialIcons
              name="check-circle"
              size={64}
              color={iconColors.primary}
            />
            <Text className="text-lg mt-4 font-semibold text-text-primary dark:text-white">
              All caught up!
            </Text>
            <Text className="text-sm mt-1 text-center font-regular text-text-muted dark:text-slate-400">
              No care tasks scheduled for now
            </Text>
          </View>
        )}

        <View className="gap-6">
          {/* Overdue Section */}
          {overdueCount > 0 && (
            <View>
              <View className="flex-row items-center mb-3">
                <SectionHeader title="Overdue" />
                <View className="ml-2 px-2 py-0.5 rounded-full bg-coral">
                  <Text className="text-xs font-semibold text-white">
                    {overdueCount}
                  </Text>
                </View>
              </View>
              {pipe(
                tasks?.overdue ?? [],
                Array.map((task) => (
                  <CareTaskCard
                    key={task.id}
                    task={task}
                    onCardPress={() => handleCardPress(task, 'overdue')}
                    onPlantPhotoPress={() =>
                      handlePlantPhotoPress(task.plantId)
                    }
                    onUndo={() => handleUndo(task.id)}
                    overdue
                    isPendingCompletion={pendingTaskIds.has(task.id)}
                  />
                ))
              )}
            </View>
          )}

          {/* Today Section */}
          {todayCount > 0 && (
            <View>
              <SectionHeader title="Today" />
              <View className="mt-3">
                {pipe(
                  tasks?.today ?? [],
                  Array.map((task) => (
                    <CareTaskCard
                      key={task.id}
                      task={task}
                      onCardPress={() => handleCardPress(task, 'today')}
                      onPlantPhotoPress={() =>
                        handlePlantPhotoPress(task.plantId)
                      }
                      onUndo={() => handleUndo(task.id)}
                      isPendingCompletion={pendingTaskIds.has(task.id)}
                    />
                  ))
                )}
              </View>
            </View>
          )}

          {/* This Week Section */}
          {thisWeekCount > 0 && (
            <View>
              <SectionHeader title="This Week" />
              <View className="mt-3">
                {pipe(
                  tasks?.thisWeek ?? [],
                  Array.groupBy((task) => formatWeekday(task.dueDate)),
                  Record.toEntries,
                  Array.map(([dayName, dayTasks]) => (
                    <View key={dayName} className="mb-4 last:mb-0">
                      <Text className="text-xs uppercase mb-2 font-medium text-text-muted dark:text-slate-400">
                        {dayName}
                      </Text>
                      {Array.map(dayTasks, (task) => (
                        <CareTaskCard
                          key={task.id}
                          task={task}
                          onCardPress={() => handleCardPress(task, 'thisWeek')}
                          onPlantPhotoPress={() =>
                            handlePlantPhotoPress(task.plantId)
                          }
                          onUndo={() => handleUndo(task.id)}
                          isPendingCompletion={pendingTaskIds.has(task.id)}
                        />
                      ))}
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Future Task Confirmation Modal */}
      <ConfirmationModal
        visible={futureTaskModal.visible}
        title="Complete Early?"
        message={`This task is scheduled in ${futureTaskModal.daysUntilDue} day${futureTaskModal.daysUntilDue > 1 ? 's' : ''}. Complete it anyway?`}
        confirmLabel="Complete Now"
        cancelLabel="Cancel"
        onConfirm={handleConfirmFutureTask}
        onCancel={handleCancelFutureTask}
        icon={
          <MaterialIcons name="schedule" size={28} color={iconColors.warning} />
        }
      />
    </SafeAreaView>
  )
}
