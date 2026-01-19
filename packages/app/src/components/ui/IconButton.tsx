import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, type PressableProps } from 'react-native'
import { colors } from 'src/theme'

type IconButtonProps = Omit<PressableProps, 'children'> & {
  icon: keyof typeof MaterialIcons.glyphMap
  size?: number
  color?: string
}

export function IconButton({
  icon,
  size = 24,
  color = colors.textPrimary,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      className={`
        w-10 h-10 rounded-full items-center justify-center
        active:bg-black/5 dark:active:bg-white/10
        ${disabled ? 'opacity-50' : ''}
      `}
      {...props}
    >
      <MaterialIcons name={icon} size={size} color={color} />
    </Pressable>
  )
}
