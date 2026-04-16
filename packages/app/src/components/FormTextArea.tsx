import { Option, pipe } from 'effect'
import { forwardRef } from 'react'
import { Text, TextInput, type TextInputProps, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface FormTextAreaProps extends TextInputProps {
  label?: string
  error?: string
  showCharacterCount?: boolean
}

export const FormTextArea = forwardRef<TextInput, FormTextAreaProps>(
  (
    {
      label,
      error,
      showCharacterCount = false,
      maxLength,
      value,
      className,
      ...props
    },
    ref
  ) => {
    const iconColors = useIconColors()
    const characterCount = pipe(
      Option.fromNullable(value),
      Option.map((v) => v.length),
      Option.getOrElse(() => 0)
    )
    const isAtLimit = maxLength ? characterCount >= maxLength : false

    return (
      <View className="gap-2">
        {(label || showCharacterCount) && (
          <View className="flex-row justify-between items-end ml-1">
            {label && (
              <Text className="text-sm font-semibold text-text-secondary dark:text-slate-300">
                {label}
              </Text>
            )}
            {showCharacterCount && maxLength && (
              <Text
                className={`text-xs font-medium ${isAtLimit ? 'text-error' : 'text-text-muted dark:text-slate-400'}`}
              >
                {characterCount}/{maxLength}
              </Text>
            )}
          </View>
        )}
        <TextInput
          ref={ref}
          value={value}
          maxLength={maxLength}
          multiline
          placeholderTextColor={iconColors.textMuted}
          className={`rounded-2xl px-4 py-3.5 min-h-[120px] bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50 text-base text-text-primary dark:text-white font-medium leading-relaxed ${
            error ? 'border-error' : ''
          } ${pipe(
            Option.fromNullable(className),
            Option.getOrElse(() => '')
          )}`}
          style={{ textAlignVertical: 'top' }}
          {...props}
        />
        {error && (
          <Text className="text-xs ml-1 font-medium text-error">{error}</Text>
        )}
      </View>
    )
  }
)

FormTextArea.displayName = 'FormTextArea'
