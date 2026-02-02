import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, TextInput, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface PlantSearchBarProps {
  value: string
  onChangeText: (text: string) => void
  onClear: () => void
  placeholder?: string
}

export function PlantSearchBar({
  value,
  onChangeText,
  onClear,
  placeholder,
}: PlantSearchBarProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  const placeholderText = placeholder ?? t('list.searchPlaceholder')
  return (
    <View
      className="flex-row items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-slate-800 rounded-xl"
      testID="plant-search-bar"
    >
      <MaterialIcons
        name="search"
        size={20}
        color={iconColors.textMuted}
        testID="search-icon"
      />
      <TextInput
        className="flex-1 text-base text-text-primary dark:text-white"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholderText}
        placeholderTextColor={iconColors.textMuted}
        testID="search-input"
      />
      {value.length > 0 && (
        <Pressable
          onPress={onClear}
          testID="clear-button"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <MaterialIcons name="cancel" size={20} color={iconColors.textMuted} />
        </Pressable>
      )}
    </View>
  )
}
