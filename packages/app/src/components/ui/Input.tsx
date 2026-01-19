import { MaterialIcons } from '@expo/vector-icons'
import { forwardRef } from 'react'
import { TextInput, type TextInputProps, View } from 'react-native'
import { colors } from 'src/theme'

type InputProps = TextInputProps & {
  icon?: keyof typeof MaterialIcons.glyphMap
  prefix?: string
  suffix?: React.ReactNode
  error?: boolean
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ icon, prefix, suffix, error, style, ...props }, ref) => {
    return (
      <View
        className={`
          flex-row items-center w-full h-14 rounded-xl
          bg-input-bg dark:bg-surface-dark
          border
          ${error ? 'border-error' : 'border-transparent focus:border-primary'}
          px-4
        `}
      >
        {icon && (
          <View className="mr-3">
            <MaterialIcons
              name={icon}
              size={22}
              color={error ? colors.error : colors.primary}
            />
          </View>
        )}
        {prefix && (
          <View className="mr-1">
            <TextInput
              editable={false}
              value={prefix}
              className="text-lg text-text-muted"
              style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
            />
          </View>
        )}
        <TextInput
          ref={ref}
          className="flex-1 text-base text-text-primary dark:text-white"
          placeholderTextColor={colors.textMuted}
          style={[{ fontFamily: 'PlusJakartaSans_400Regular' }, style]}
          {...props}
        />
        {suffix && <View className="ml-2">{suffix}</View>}
      </View>
    )
  }
)

Input.displayName = 'Input'
