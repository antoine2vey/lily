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
          flex-row items-center w-full h-14 rounded-full
          bg-white dark:bg-[#252a1f]
          border-2
          ${error ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'}
          px-4
        `}
      >
        {icon && (
          <View className="mr-2">
            <MaterialIcons name={icon} size={24} color={colors.primary} />
          </View>
        )}
        {prefix && (
          <View className="mr-1">
            <TextInput
              editable={false}
              value={prefix}
              className="text-xl font-semibold text-text-secondary/60 dark:text-zinc-500"
              style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
            />
          </View>
        )}
        <TextInput
          ref={ref}
          className="flex-1 text-base text-zinc-900 dark:text-white"
          placeholderTextColor="#9ca3af"
          style={[{ fontFamily: 'PlusJakartaSans_400Regular' }, style]}
          {...props}
        />
        {suffix && <View className="ml-2">{suffix}</View>}
      </View>
    )
  }
)

Input.displayName = 'Input'
