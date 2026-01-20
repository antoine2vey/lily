import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, TextInput, View } from 'react-native'

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
  placeholder = 'Search plants...',
}: PlantSearchBarProps) {
  return (
    <View
      className="flex-row items-center gap-2 px-4 py-3 bg-gray-100 rounded-xl"
      testID="plant-search-bar"
    >
      <MaterialIcons
        name="search"
        size={20}
        color="#9E9E9E"
        testID="search-icon"
      />
      <TextInput
        className="flex-1 text-base text-[#141712]"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9E9E9E"
        testID="search-input"
      />
      {value.length > 0 && (
        <Pressable
          onPress={onClear}
          testID="clear-button"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <MaterialIcons name="cancel" size={20} color="#9E9E9E" />
        </Pressable>
      )}
    </View>
  )
}
