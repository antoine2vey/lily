import { Text, TextInput, View } from 'react-native'
import { iconColors } from 'src/theme'

interface BioInputProps {
  value: string
  onChangeText: (text: string) => void
  maxLength?: number
}

export function BioInput({
  value,
  onChangeText,
  maxLength = 150,
}: BioInputProps) {
  const characterCount = value.length
  const isAtLimit = characterCount >= maxLength

  return (
    <View className="mb-4">
      <View className="flex-row justify-between mb-2">
        <Text className="text-sm font-medium text-text-primary">Bio</Text>
        <Text
          className={`text-sm font-regular ${isAtLimit ? 'text-coral' : 'text-text-muted'}`}
        >
          {characterCount}/{maxLength}
        </Text>
      </View>
      <TextInput
        value={value}
        onChangeText={(text) => {
          if (text.length <= maxLength) {
            onChangeText(text)
          }
        }}
        multiline
        numberOfLines={4}
        placeholder="Tell us about yourself and your plants..."
        placeholderTextColor={iconColors.textMuted}
        className="rounded-xl p-4 min-h-[120px] bg-input-bg text-base text-text-primary font-regular"
        style={{ textAlignVertical: 'top' }}
        maxLength={maxLength}
      />
    </View>
  )
}
