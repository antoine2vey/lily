import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { ListRow } from 'src/components/ListRow'
import { useIconColors } from 'src/hooks/useIconColors'

type SortOption = 'name' | 'dateAdded' | 'nextWater' | 'health'

interface SortDefinition {
  key: SortOption
  label: string
}

const SORT_OPTIONS: ReadonlyArray<SortDefinition> = [
  { key: 'name', label: 'Name (A-Z)' },
  { key: 'dateAdded', label: 'Recently Added' },
  { key: 'nextWater', label: 'Needs Water Soon' },
  { key: 'health', label: 'Needs Attention' },
]

interface SortOptionsSheetProps {
  visible: boolean
  onClose: () => void
  selectedOption: SortOption
  onSelect: (option: SortOption) => void
}

export function SortOptionsSheet({
  visible,
  onClose,
  selectedOption,
  onSelect,
}: SortOptionsSheetProps) {
  const iconColors = useIconColors()

  const handleSelect = (option: SortOption) => {
    onSelect(option)
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort by">
      <View testID="sort-options-sheet">
        {Array.map(SORT_OPTIONS, ({ key, label }) => (
          <ListRow
            key={key}
            title={label}
            rightElement={
              selectedOption === key ? (
                <MaterialIcons
                  name="check"
                  size={20}
                  color={iconColors.primary}
                />
              ) : undefined
            }
            onPress={() => handleSelect(key)}
          />
        ))}
      </View>
    </BottomSheet>
  )
}

export type { SortOption }
