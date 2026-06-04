import { useTranslation } from 'react-i18next'
import { Switch, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface SkipWaitingToggleProps {
  value: boolean
  onValueChange: (value: boolean) => void
}

/**
 * Compact "power user" toggle for the Care screen header. When on, completing an
 * overdue/today task skips the undo countdown and fires immediately.
 */
export function SkipWaitingToggle({
  value,
  onValueChange,
}: SkipWaitingToggleProps) {
  const { t } = useTranslation('care')
  const iconColors = useIconColors()

  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-xs font-medium uppercase tracking-wide text-text-muted dark:text-slate-400">
        {t('skipWaiting.label')}
      </Text>
      <Switch
        testID="skip-waiting-toggle"
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={t('skipWaiting.label')}
        accessibilityHint={t('skipWaiting.hint')}
        trackColor={{ false: iconColors.border, true: iconColors.primary }}
        thumbColor={iconColors.white}
        ios_backgroundColor={iconColors.border}
        // Dynamic transform — not expressible via Tailwind; shrinks the native
        // switch so it reads as a small header affordance.
        style={{ transform: [{ scale: 0.85 }] }}
      />
    </View>
  )
}
