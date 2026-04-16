import { MaterialIcons } from '@expo/vector-icons'
import type { LanguageCode } from '@lily/shared'
import { Array } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/Button'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'

interface LanguageSelectionModalProps {
  visible: boolean
  onClose: () => void
}

export function LanguageSelectionModal({
  visible,
  onClose,
}: LanguageSelectionModalProps) {
  const iconColors = useIconColors()
  const { t, language, setLanguage, supportedLanguages } = useLocalization()

  const handleSelect = async (code: LanguageCode) => {
    await setLanguage(code)
    onClose()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('settings:appearance.language')}
    >
      <View className="py-2">
        {Array.map(supportedLanguages, ({ code, nativeName }) => (
          <Pressable
            key={code}
            onPress={() => handleSelect(code)}
            className="flex-row items-center py-4 active:opacity-70"
          >
            <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-primary-tint dark:bg-primary/20">
              <MaterialIcons
                name="language"
                size={20}
                color={iconColors.primary}
              />
            </View>
            <Text className="flex-1 text-base font-medium text-text-primary dark:text-white">
              {nativeName}
            </Text>
            {language === code && (
              <MaterialIcons
                name="check"
                size={24}
                color={iconColors.primary}
              />
            )}
          </Pressable>
        ))}
      </View>
      <View className="mt-2 mb-4">
        <Button variant="secondary" onPress={onClose}>
          {t('common:buttons.done')}
        </Button>
      </View>
    </BottomSheet>
  )
}
