import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, parseApiDate } from '@lily/shared'
import { Array as Arr, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Avatar } from 'src/components/Avatar'
import { SectionHeader } from 'src/components/SectionHeader'
import { useDelegatedTasks } from 'src/hooks/useDelegatedTasks'
import { useIconColors } from 'src/hooks/useIconColors'

export function DelegatedTasksSection() {
  const iconColors = useIconColors()
  const { data: tasks } = useDelegatedTasks()

  const delegatedTasks = [
    ...pipe(
      Option.fromNullable(tasks),
      Option.getOrElse(
        () =>
          [] as Array<{
            delegationId: string
            plantId: string
            plantName: string
            plantImage: string | null
            ownerName: string | null
            nextWateringAt: Date | null
            nextFertilizationAt: Date | null
            health: string
          }>
      )
    ),
  ]

  if (Arr.isEmptyArray(delegatedTasks)) {
    return null
  }

  const visibleTasks = Arr.take([...delegatedTasks], 3)

  return (
    <Animated.View entering={FadeIn.duration(300)} className="mt-6">
      <SectionHeader
        title="Delegated Plants"
        action={{
          label: 'View All',
          onPress: () => router.push('/delegations'),
        }}
      />

      <View className="mt-3 gap-2">
        {Arr.map(visibleTasks, (task) => {
          const nextWatering = pipe(
            Option.fromNullable(task.nextWateringAt),
            Option.flatMap(parseApiDate),
            Option.map(formatShortDate),
            Option.getOrElse(() => 'No schedule')
          )

          const ownerName = pipe(
            Option.fromNullable(task.ownerName),
            Option.getOrElse(() => 'Unknown')
          )

          return (
            <Pressable
              key={`${task.delegationId}-${task.plantId}`}
              onPress={() => router.push(`/plant/${task.plantId}`)}
              className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark active:bg-surface-tinted dark:active:bg-slate-700"
            >
              <Avatar
                source={pipe(
                  Option.fromNullable(task.plantImage),
                  Option.map((uri) => ({ uri })),
                  Option.getOrUndefined
                )}
                name={task.plantName}
                size="md"
              />
              <View className="flex-1 ml-3">
                <Text
                  className="text-sm font-medium text-text-primary dark:text-white"
                  numberOfLines={1}
                >
                  {task.plantName}
                </Text>
                <Text className="text-xs text-text-muted dark:text-slate-400">
                  {ownerName}&apos;s plant
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <MaterialIcons
                    name="water-drop"
                    size={12}
                    color={iconColors.waterBlue}
                  />
                  <Text className="text-xs ml-1 text-water-blue">
                    {nextWatering}
                  </Text>
                </View>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={iconColors.border}
              />
            </Pressable>
          )
        })}
      </View>
    </Animated.View>
  )
}
