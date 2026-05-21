import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from '@callstack/liquid-glass'
import { MaterialIcons } from '@expo/vector-icons'
import { Platform, Pressable } from 'react-native'

const useGlass = isLiquidGlassSupported && Platform.OS === 'ios'

interface GlassIconButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  iconColor: string
  testID?: string
}

export function GlassIconButton({
  icon,
  onPress,
  iconColor,
  testID,
}: GlassIconButtonProps) {
  if (useGlass) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <LiquidGlassView
          interactive={false}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialIcons
            name={icon}
            size={22}
            color={iconColor}
            style={{ lineHeight: 22 }}
          />
        </LiquidGlassView>
      </Pressable>
    )
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className="w-10 h-10 items-center justify-center rounded-full bg-white dark:bg-surface-dark"
    >
      <MaterialIcons name={icon} size={24} color={iconColor} />
    </Pressable>
  )
}
