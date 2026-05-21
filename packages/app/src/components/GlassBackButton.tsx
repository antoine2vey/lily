import { router } from 'expo-router'
import { GlassIconButton } from '@/components/GlassIconButton'
import { useIconColors } from '@/hooks/useIconColors'

interface GlassBackButtonProps {
  onPress?: () => void
  testID?: string
}

export function GlassBackButton({ onPress, testID }: GlassBackButtonProps) {
  const iconColors = useIconColors()
  return (
    <GlassIconButton
      icon="arrow-back"
      onPress={onPress ?? (() => router.back())}
      iconColor={iconColors.textPrimary}
      testID={testID}
    />
  )
}
