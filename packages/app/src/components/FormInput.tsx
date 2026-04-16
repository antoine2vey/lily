import { Option, pipe } from 'effect'
import { forwardRef } from 'react'
import { Text, TextInput, type TextInputProps, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface FormInputProps extends TextInputProps {
  label?: string
  error?: string
}

export const FormInput = forwardRef<TextInput, FormInputProps>(
  ({ label, error, className, ...props }, ref) => {
    const iconColors = useIconColors()

    return (
      <View className="gap-2">
        {label && (
          <Text className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300">
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={iconColors.textMuted}
          className={`rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50 text-base text-text-primary dark:text-white font-medium ${
            error ? 'border-error' : ''
          } ${pipe(
            Option.fromNullable(className),
            Option.getOrElse(() => '')
          )}`}
          {...props}
        />
        {error && (
          <Text className="text-xs ml-1 font-medium text-error">{error}</Text>
        )}
      </View>
    )
  }
)

FormInput.displayName = 'FormInput'
