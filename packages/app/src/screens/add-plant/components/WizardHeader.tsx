import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { ProgressBar } from 'src/components/ProgressBar'
import { iconColors } from 'src/theme'

interface WizardHeaderProps {
  step: number
  totalSteps: number
  onBack: () => void
  title?: string
}

export function WizardHeader({
  step,
  totalSteps,
  onBack,
  title = 'Add New Plant',
}: WizardHeaderProps) {
  const progress = step / totalSteps

  return (
    <View className="px-4 pt-2 pb-4">
      <View className="flex-row items-center justify-between mb-3">
        <Pressable
          onPress={onBack}
          className="w-10 h-10 items-center justify-center rounded-full active:bg-primary-tint"
        >
          <MaterialIcons
            name="chevron-left"
            size={28}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="text-lg font-semibold text-text-primary">{title}</Text>
        <Text className="text-sm font-medium text-text-muted">
          {step} of {totalSteps}
        </Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  )
}
