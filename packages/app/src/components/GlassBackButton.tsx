import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from '@callstack/liquid-glass'
import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Platform, Pressable } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

const useGlass = isLiquidGlassSupported && Platform.OS === 'ios'

interface GlassBackButtonProps {
  onPress?: () => void
  testID?: string
}

export function GlassBackButton({ onPress, testID }: GlassBackButtonProps) {
  const iconColors = useIconColors()
  const handlePress = onPress ?? (() => router.back())

  if (useGlass) {
    return (
      <Pressable
        onPress={handlePress}
        testID={testID}
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
            name="arrow-back"
            size={22}
            color={iconColors.textPrimary}
            style={{ lineHeight: 22 }}
          />
        </LiquidGlassView>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={handlePress}
      testID={testID}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className="w-10 h-10 items-center justify-center rounded-full"
    >
      <MaterialIcons
        name="arrow-back"
        size={24}
        color={iconColors.textPrimary}
      />
    </Pressable>
  )
}
