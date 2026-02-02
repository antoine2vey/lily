import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

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
  title,
}: WizardHeaderProps) {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const progress = (step / totalSteps) * 100
  const displayTitle = title ?? t('wizardTitle')

  return (
    <View className="px-4 pt-2 pb-2 bg-background dark:bg-background-dark">
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable
          onPress={onBack}
          className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-tinted dark:active:bg-slate-800"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white flex-1 text-center">
          {displayTitle}
        </Text>
        <View className="w-12 items-end">
          <Text className="text-sm font-bold text-primary dark:text-primary-light">
            {t('stepIndicator', { step, total: totalSteps })}
          </Text>
        </View>
      </View>
      {/* Progress bar */}
      <View className="h-1.5 rounded-full bg-surface-tinted dark:bg-slate-700 overflow-hidden">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${progress}%` }}
        />
      </View>
    </View>
  )
}
