import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface GlassOptionProps {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  description?: string
  /** Omit for a tap-to-continue row (shows a chevron); pass a boolean for a single-choice row. */
  selected?: boolean
  onPress: () => void
  testID?: string
}

/** A row inside a GlassCard: icon, title, optional description. */
export function GlassOption({
  icon,
  title,
  description,
  selected,
  onPress,
  testID,
}: GlassOptionProps) {
  const iconColors = useIconColors()
  const isChoice = selected !== undefined

  return (
    <Pressable
      testID={testID}
      accessibilityRole={isChoice ? 'radio' : 'button'}
      accessibilityState={isChoice ? { selected } : undefined}
      onPress={onPress}
      className={`flex-row items-center gap-3 p-3 rounded-2xl border ${
        selected
          ? 'bg-primary/30 border-primary-light'
          : 'bg-white/10 border-white/15 active:bg-white/20'
      }`}
    >
      <View
        className={`w-11 h-11 rounded-full items-center justify-center ${
          selected ? 'bg-primary' : 'bg-white/15'
        }`}
      >
        <MaterialIcons name={icon} size={22} color={iconColors.white} />
      </View>
      <View className="flex-1">
        <Text
          className="text-base text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {title}
        </Text>
        {description && (
          <Text
            className="text-sm text-white/70 mt-0.5"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {description}
          </Text>
        )}
      </View>
      {isChoice ? (
        <MaterialIcons
          name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={22}
          color={selected ? iconColors.white : 'rgba(255,255,255,0.5)'}
        />
      ) : (
        <MaterialIcons
          name="chevron-right"
          size={22}
          color="rgba(255,255,255,0.6)"
        />
      )}
    </Pressable>
  )
}
