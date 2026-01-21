import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface QuickActionsProps {
  onWater: () => void
  onFertilize: () => void
  onPhoto: () => void
  onChat: () => void
}

type ActionKey = 'water' | 'fertilize' | 'photo' | 'chat'

interface ActionConfig {
  key: ActionKey
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
}

const ACTIONS: ReadonlyArray<ActionConfig> = [
  { key: 'water', icon: 'water-drop', label: 'Water' },
  { key: 'fertilize', icon: 'eco', label: 'Fertilize' },
  { key: 'photo', icon: 'camera-alt', label: 'Photo' },
  { key: 'chat', icon: 'chat', label: 'Chat' },
]

export function QuickActions({
  onWater,
  onFertilize,
  onPhoto,
  onChat,
}: QuickActionsProps) {
  const handlers: Record<ActionKey, () => void> = {
    water: onWater,
    fertilize: onFertilize,
    photo: onPhoto,
    chat: onChat,
  }

  return (
    <View className="flex-row justify-around" testID="quick-actions">
      {Array.map(ACTIONS, ({ key, icon, label }) => (
        <Pressable
          key={key}
          onPress={handlers[key]}
          className="items-center"
          testID={`quick-action-${key}`}
        >
          <View className="w-12 h-12 rounded-full items-center justify-center bg-primary-tint">
            <MaterialIcons name={icon} size={24} color={iconColors.primary} />
          </View>
          <Text className="text-xs mt-2 font-regular text-text-muted">
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
