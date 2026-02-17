import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, parseApiDate } from '@lily/shared'
import { Array as Arr, Option, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Avatar } from '@/components/Avatar'
import { useIconColors } from '@/hooks/useIconColors'

interface DelegationPlant {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  health: string
}

interface DelegationPlantListProps {
  plants: ReadonlyArray<DelegationPlant>
  onPlantPress?: (plantId: string) => void
}

export function DelegationPlantList({
  plants,
  onPlantPress,
}: DelegationPlantListProps) {
  const iconColors = useIconColors()

  if (Arr.isEmptyArray([...plants])) {
    return (
      <View className="items-center py-6">
        <Text className="text-sm text-text-muted dark:text-slate-400">
          No plants in this delegation
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-2">
      <Text
        className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        Plants ({plants.length})
      </Text>
      <Animated.View entering={FadeIn.duration(300)} className="gap-2">
        {Arr.map(plants, (plant) => {
          const nextWatering = pipe(
            Option.fromNullable(plant.nextWateringAt),
            Option.flatMap(parseApiDate),
            Option.map(formatShortDate),
            Option.getOrElse(() => 'No schedule')
          )

          return (
            <Pressable
              key={plant.id}
              onPress={() => onPlantPress?.(plant.id)}
              className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark active:bg-surface-tinted dark:active:bg-slate-700"
            >
              <Avatar
                source={pipe(
                  Option.fromNullable(plant.imageUrl),
                  Option.map((uri) => ({ uri })),
                  Option.getOrUndefined
                )}
                name={plant.name}
                size="sm"
              />
              <View className="flex-1 ml-3">
                <Text
                  className="text-sm font-medium text-text-primary dark:text-white"
                  numberOfLines={1}
                >
                  {plant.name}
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <MaterialIcons
                    name="water-drop"
                    size={12}
                    color={iconColors.waterBlue}
                  />
                  <Text className="text-xs ml-1 text-text-muted dark:text-slate-400">
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
      </Animated.View>
    </View>
  )
}
