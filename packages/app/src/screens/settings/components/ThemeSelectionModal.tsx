import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { Button } from 'src/components/ui/Button'
import { iconColors } from 'src/theme'

type Theme = 'light' | 'dark' | 'system'

interface ThemeOption {
  key: Theme
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
}

const THEME_OPTIONS: ThemeOption[] = [
  { key: 'light', label: 'Light', icon: 'light-mode' },
  { key: 'dark', label: 'Dark', icon: 'dark-mode' },
  { key: 'system', label: 'System', icon: 'smartphone' },
]

interface ThemeSelectionModalProps {
  visible: boolean
  onClose: () => void
  currentTheme: Theme
  onSelect: (theme: Theme) => void
}

export function ThemeSelectionModal({
  visible,
  onClose,
  currentTheme,
  onSelect,
}: ThemeSelectionModalProps) {
  const handleSelect = (theme: Theme) => {
    onSelect(theme)
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Theme">
      <View className="py-2">
        {THEME_OPTIONS.map(({ key, label, icon }) => (
          <Pressable
            key={key}
            onPress={() => handleSelect(key)}
            className="flex-row items-center py-4 active:opacity-70"
          >
            <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-primary-tint">
              <MaterialIcons name={icon} size={20} color={iconColors.primary} />
            </View>
            <Text className="flex-1 text-base font-medium text-text-primary">
              {label}
            </Text>
            {currentTheme === key && (
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
          Done
        </Button>
      </View>
    </BottomSheet>
  )
}
