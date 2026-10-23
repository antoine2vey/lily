import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { TextInput, type TextInputProps, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

type GlassInputProps = TextInputProps & {
  icon?: keyof typeof MaterialIcons.glyphMap
  /** Text shown before the value, e.g. "@" for a username. */
  prefix?: string
  /** Content after the field, e.g. a validation badge. */
  suffix?: ReactNode
  error?: boolean
}

/** Pill text field for the mesh background. */
export function GlassInput({
  icon,
  prefix,
  suffix,
  error,
  style,
  ...props
}: GlassInputProps) {
  const iconColors = useIconColors()

  return (
    <View
      className={`flex-row items-center h-14 rounded-full bg-white/15 px-5 border ${
        error ? 'border-error' : 'border-white/25'
      }`}
    >
      {icon && (
        <MaterialIcons
          name={icon}
          size={20}
          color={error ? iconColors.error : 'rgba(255,255,255,0.75)'}
        />
      )}
      {prefix && (
        <TextInput
          editable={false}
          value={prefix}
          className="text-base text-white/60"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        />
      )}
      <TextInput
        className={`flex-1 text-base text-white ${icon ? 'ml-3' : ''}`}
        style={[{ fontFamily: 'SpaceGrotesk_500Medium' }, style]}
        placeholderTextColor="rgba(255,255,255,0.5)"
        {...props}
      />
      {suffix}
    </View>
  )
}
