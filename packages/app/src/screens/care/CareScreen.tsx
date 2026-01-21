import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SectionHeader } from 'src/components/SectionHeader'
import { useCareTasks } from 'src/hooks/useCareTasks'
import { useCompleteTask } from 'src/hooks/useCompleteTask'
import { iconColors } from 'src/theme'
import { CareTaskCard } from './components/CareTaskCard'

function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }
  return date.toLocaleDateString('en-US', options).toUpperCase()
}

function formatWeekday(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

export function CareScreen() {
  const { data: tasks, isLoading } = useCareTasks()
  const { mutate: completeTask } = useCompleteTask()
  const today = new Date()

  const handleTaskPress = (plantId: string) => {
    router.push(`/plant/${plantId}`)
  }

  const handleCompleteTask = (taskId: string) => {
    completeTask(taskId)
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const overdueCount = tasks?.overdue.length ?? 0
  const todayCount = tasks?.today.length ?? 0
  const thisWeekCount = tasks?.thisWeek.length ?? 0
  const totalTasks = overdueCount + todayCount + thisWeekCount

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-2 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase font-medium text-text-muted">
              Today, {formatDate(today)}
            </Text>
            <Text className="text-3xl mt-1 font-bold text-text-primary">
              Care
            </Text>
          </View>
          <Pressable className="w-10 h-10 rounded-full items-center justify-center bg-surface">
            <MaterialIcons
              name="calendar-today"
              size={22}
              color={iconColors.textPrimary}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {totalTasks === 0 && (
          <View className="items-center py-12">
            <MaterialIcons
              name="check-circle"
              size={64}
              color={iconColors.primary}
            />
            <Text className="text-lg mt-4 font-semibold text-text-primary">
              All caught up!
            </Text>
            <Text className="text-sm mt-1 text-center font-regular text-text-muted">
              No care tasks scheduled for now
            </Text>
          </View>
        )}

        {/* Overdue Section */}
        {overdueCount > 0 && (
          <View className="mb-6">
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
                  onPress={() => handleTaskPress(task.plantId)}
                  onComplete={() => handleCompleteTask(task.id)}
                  overdue
                />
              ))
            )}
          </View>
        )}

        {/* Today Section */}
        {todayCount > 0 && (
          <View className="mb-6">
            <SectionHeader title="Today" />
            <View className="mt-3">
              {pipe(
                tasks?.today ?? [],
                Array.map((task) => (
                  <CareTaskCard
                    key={task.id}
                    task={task}
                    onPress={() => handleTaskPress(task.plantId)}
                    onComplete={() => handleCompleteTask(task.id)}
                  />
                ))
              )}
            </View>
          </View>
        )}

        {/* This Week Section */}
        {thisWeekCount > 0 && (
          <View className="mb-6">
            <SectionHeader title="This Week" />
            <View className="mt-3">
              {pipe(
                tasks?.thisWeek ?? [],
                Array.map((task) => (
                  <View key={task.id}>
                    <Text className="text-xs uppercase mb-2 font-medium text-text-muted">
                      {formatWeekday(task.dueDate)}
                    </Text>
                    <CareTaskCard
                      task={task}
                      onPress={() => handleTaskPress(task.plantId)}
                      onComplete={() => handleCompleteTask(task.id)}
                    />
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Bottom spacer */}
        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  )
}
