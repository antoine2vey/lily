import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, useWindowDimensions } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

/** Dev-only floating button, under DevThemeToggle, that opens the achievement unlock modal. */
export function DevAchievementButton({ onPress }: { onPress: () => void }) {
  const iconColors = useIconColors()
  const { height } = useWindowDimensions()

  return (
    <Pressable
      testID="dev-achievement-button"
      accessibilityRole="button"
      accessibilityLabel="Preview achievement unlock (dev only)"
      onPress={onPress}
      hitSlop={8}
      className="absolute right-2 w-10 h-10 rounded-full items-center justify-center bg-black/50 active:bg-black/70"
      style={{ top: height * 0.45 + 52 }}
    >
      <MaterialIcons name="emoji-events" size={20} color={iconColors.white} />
    </Pressable>
  )
}
