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
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { PullToRefresh } from 'src/components/PullToRefresh'
import { SectionHeader } from 'src/components/SectionHeader'
import { CareTaskCardSkeleton, SkeletonBox } from 'src/components/skeletons'
import { useCareTasks } from 'src/hooks/useCareTasks'
import { useCompleteTask } from 'src/hooks/useCompleteTask'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { CareTaskCard } from 'src/screens/care/components/CareTaskCard'
import { DelegatedTasksSection } from 'src/screens/care/components/DelegatedTasksSection'

type TaskSectionType = 'overdue' | 'today' | 'upcoming'

interface FutureTaskModalState {
  visible: boolean
  task: CareTask | null
  daysUntilDue: number
}

const formatDate = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string => formatDateHeader(dateTime, locale)

const formatWeekday = (
  date: Date,
  fallback: string,
  locale?: Intl.LocalesArgument
): string =>
  pipe(
    parseApiDate(date),
    Option.map((dt) => formatDayOfWeek(dt, locale)),
    Option.getOrElse(() => fallback)
  )

const calculateDaysUntilDue = (dueDate: Date): number =>
  pipe(
    parseApiDate(dueDate),
    Option.map(daysUntil),
    Option.getOrElse(() => 0)
  )

const getTaskActionKey = (type: CareTaskType): 'water' | 'fertilize' =>
  pipe(
    Match.value(type),
    Match.when('water', () => 'water' as const),
    Match.when('fertilize', () => 'fertilize' as const),
    Match.exhaustive
  )

function CareContentSkeleton() {
  return (
    <View className="gap-6">
      {/* Overdue section */}
      <View>
        <View className="flex-row items-center mb-3">
          <SkeletonBox width={80} height={20} rounded="sm" />
          <View className="ml-2">
            <SkeletonBox width={24} height={20} rounded="full" />
          </View>
        </View>
        <CareTaskCardSkeleton />
        <CareTaskCardSkeleton />
      </View>

      {/* Today section */}
      <View>
        <SkeletonBox width={60} height={20} rounded="sm" />
        <View className="mt-3">
          <CareTaskCardSkeleton />
          <CareTaskCardSkeleton />
          <CareTaskCardSkeleton />
        </View>
      </View>

      {/* Upcoming section */}
      <View>
        <SkeletonBox width={80} height={20} rounded="sm" />
        <View className="mt-3">
          <View className="mb-4">
            <SkeletonBox width={70} height={12} rounded="sm" className="mb-2" />
            <CareTaskCardSkeleton compact />
            <CareTaskCardSkeleton compact />
          </View>
          <View className="mb-4">
            <SkeletonBox width={80} height={12} rounded="sm" className="mb-2" />
            <CareTaskCardSkeleton compact />
          </View>
        </View>
      </View>
    </View>
  )
}

export function CareScreen() {
  const { t, i18n } = useTranslation('care')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const { data: tasks, isLoading, isRefetching, refetch } = useCareTasks()
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
    setPendingTaskIds((prev) => new Set(prev).add(task.id))

    const timeoutId = setTimeout(() => {
      handleCompleteTaskApi(task.id, task.plantId, task.type)
      toast.success(
        `${task.plantName} ${t(`types.${getTaskActionKey(task.type)}.completed`)}!`
      )
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
      Match.when('upcoming', () => {
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

  const isInitialLoading = isLoading && !tasks
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const overdueTasks = useMemo(
    () =>
      Option.getOrElse(
        Option.fromNullable(tasks?.overdue),
        () => [] as NonNullable<typeof tasks>['overdue']
      ),
    [tasks?.overdue]
  )

  const todayTasks = useMemo(
    () =>
      Option.getOrElse(
        Option.fromNullable(tasks?.today),
        () => [] as NonNullable<typeof tasks>['today']
      ),
    [tasks?.today]
  )

  const upcomingTasks = useMemo(
    () =>
      Option.getOrElse(
        Option.fromNullable(tasks?.upcoming),
        () => [] as NonNullable<typeof tasks>['upcoming']
      ),
    [tasks?.upcoming]
  )

  const groupedThisWeek = useMemo(
    () =>
      pipe(
        upcomingTasks,
        Array.groupBy((task) =>
          formatWeekday(task.dueDate, t('unknownDay'), i18n.language)
        ),
        Record.toEntries
      ),
    [upcomingTasks, t, i18n.language]
  )

  const overdueCount = Array.length(overdueTasks)
  const todayCount = Array.length(todayTasks)
  const upcomingCount = Array.length(upcomingTasks)
  const totalTasks = overdueCount + todayCount + upcomingCount

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header - always rendered */}
      <View className="px-6 pt-2 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase font-medium text-text-muted dark:text-slate-400">
              {t('screen.todayDate', {
                date: formatDate(today, i18n.language),
              })}
            </Text>
            <Text className="text-3xl mt-1 font-bold text-text-primary dark:text-white">
              {t('screen.title')}
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

      <PullToRefresh isRefreshing={isRefetching} onRefresh={refetch}>
        {(scrollHandler) => (
          <Animated.ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
          >
            {/* Content */}
            {showSkeleton ? (
              <Animated.View entering={FadeIn.duration(300)}>
                <CareContentSkeleton />
              </Animated.View>
            ) : isInitialLoading ? null : (
              <Animated.View entering={FadeIn.duration(300)}>
                {totalTasks === 0 && (
                  <View className="items-center py-12">
                    <MaterialIcons
                      name="check-circle"
                      size={64}
                      color={iconColors.primary}
                    />
                    <Text className="text-lg mt-4 font-semibold text-text-primary dark:text-white">
                      {t('screen.allCaughtUp')}
                    </Text>
                    <Text className="text-sm mt-1 text-center font-regular text-text-muted dark:text-slate-400">
                      {t('screen.noTasksScheduled')}
                    </Text>
                  </View>
                )}

                <View className="gap-6">
                  {overdueCount > 0 && (
                    <View>
                      <View className="flex-row items-center mb-3">
                        <SectionHeader title={t('screen.sections.overdue')} />
                        <View className="ml-2 px-2 py-0.5 rounded-full bg-coral">
                          <Text className="text-xs font-semibold text-white">
                            {overdueCount}
                          </Text>
                        </View>
                      </View>
                      {Array.map(overdueTasks, (task) => (
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
                      ))}
                    </View>
                  )}

                  {todayCount > 0 && (
                    <View>
                      <SectionHeader title={t('screen.sections.today')} />
                      <View className="mt-3">
                        {Array.map(todayTasks, (task) => (
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
                        ))}
                      </View>
                    </View>
                  )}

                  {upcomingCount > 0 && (
                    <View>
                      <SectionHeader title={t('screen.sections.upcoming')} />
                      <View className="mt-3">
                        {Array.map(groupedThisWeek, ([dayName, dayTasks]) => (
                          <View key={dayName} className="mb-4 last:mb-0">
                            <Text className="text-xs uppercase mb-2 font-medium text-text-muted dark:text-slate-400">
                              {dayName}
                            </Text>
                            {Array.map(dayTasks, (task) => (
                              <CareTaskCard
                                key={task.id}
                                task={task}
                                onCardPress={() =>
                                  handleCardPress(task, 'upcoming')
                                }
                                onPlantPhotoPress={() =>
                                  handlePlantPhotoPress(task.plantId)
                                }
                                onUndo={() => handleUndo(task.id)}
                                isPendingCompletion={pendingTaskIds.has(
                                  task.id
                                )}
                              />
                            ))}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Delegated Plants Section */}
                <DelegatedTasksSection />
              </Animated.View>
            )}
          </Animated.ScrollView>
        )}
      </PullToRefresh>

      <ConfirmationModal
        visible={futureTaskModal.visible}
        title={t('screen.completeEarly.title')}
        message={t('screen.completeEarly.message', {
          count: futureTaskModal.daysUntilDue,
        })}
        confirmLabel={t('screen.completeEarly.confirm')}
        cancelLabel={t('screen.completeEarly.cancel')}
        onConfirm={handleConfirmFutureTask}
        onCancel={handleCancelFutureTask}
        icon={
          <MaterialIcons name="schedule" size={28} color={iconColors.warning} />
        }
      />
    </View>
  )
}
