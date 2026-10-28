import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { Avatar } from '@/components/Avatar'

interface SelectablePlantRowProps {
  plant: { id: string; name: string; imageUrl: string | null }
  selected: boolean
  onToggle: (plantId: string) => void
}

export function SelectablePlantRow({
  plant,
  selected,
  onToggle,
}: SelectablePlantRowProps) {
  return (
    <Pressable
      onPress={() => onToggle(plant.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={plant.name}
      className={`flex-row items-center p-3 rounded-xl border-2 ${
        selected
          ? 'border-primary/50 bg-primary-tint dark:bg-primary/10'
          : 'border-transparent bg-surface dark:bg-surface-dark'
      }`}
    >
      <Avatar
        source={pipe(
          Option.fromNullishOr(plant.imageUrl),
          Option.map((uri) => ({ uri })),
          Option.getOrUndefined
        )}
        name={plant.name}
        size="sm"
      />
      <Text
        className="flex-1 ml-3 text-sm font-medium text-text-primary dark:text-white"
        numberOfLines={1}
      >
        {plant.name}
      </Text>
      <View
        className={`w-6 h-6 rounded-md items-center justify-center ${
          selected
            ? 'bg-primary'
            : 'border-2 border-border dark:border-slate-600'
        }`}
      >
        {selected && <MaterialIcons name="check" size={16} color="white" />}
      </View>
    </Pressable>
  )
}
