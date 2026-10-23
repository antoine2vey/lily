import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { GlassIconButton } from '@/components/GlassIconButton'
import { useIconColors } from '@/hooks/useIconColors'

interface GlassBackButtonProps {
  onPress?: () => void
  testID?: string
}

export function GlassBackButton({ onPress, testID }: GlassBackButtonProps) {
  const { t } = useTranslation('common')
  const iconColors = useIconColors()
  return (
    <GlassIconButton
      icon="arrow-back"
      onPress={onPress ?? (() => router.back())}
      iconColor={iconColors.textPrimary}
      accessibilityLabel={t('a11y.back')}
      testID={testID}
    />
  )
}
