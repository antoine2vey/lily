import { MaterialIcons } from '@expo/vector-icons'
import { Pressable } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface WelcomeNavButtonProps {
  icon: 'chevron-left' | 'chevron-right'
  label: string
  onPress: () => void
  disabled?: boolean
}

/** Round glass button that steps the carousel back or forward. */
export function WelcomeNavButton({
  icon,
  label,
  onPress,
  disabled,
}: WelcomeNavButtonProps) {
  const iconColors = useIconColors()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={`w-14 h-14 rounded-full bg-white/15 border border-white/25 items-center justify-center active:bg-white/25 ${
        disabled ? 'opacity-30' : ''
      }`}
    >
      <MaterialIcons name={icon} size={28} color={iconColors.white} />
    </Pressable>
  )
}
