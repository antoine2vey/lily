import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { ListRow } from '@/components/ListRow'
import { useIconColors } from '@/hooks/useIconColors'

type SortOption = 'name' | 'dateAdded' | 'nextWater' | 'health'

interface SortDefinition {
  key: SortOption
  labelKey: 'sortName' | 'sortRecent' | 'sortNextCare' | 'sortNeedsAttention'
}

const SORT_OPTIONS: ReadonlyArray<SortDefinition> = [
  { key: 'name', labelKey: 'sortName' },
  { key: 'dateAdded', labelKey: 'sortRecent' },
  { key: 'nextWater', labelKey: 'sortNextCare' },
  { key: 'health', labelKey: 'sortNeedsAttention' },
]

const getSortLabel = (
  labelKey: SortDefinition['labelKey'],
  t: TFunction
): string => t(`list.${labelKey}`)

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
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()

  const handleSelect = (option: SortOption) => {
    onSelect(option)
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('list.sortBy')}>
      <View testID="sort-options-sheet">
        {pipe(
          SORT_OPTIONS,
          Array.map(({ key, labelKey }) => (
            <ListRow
              key={key}
              title={getSortLabel(labelKey, t)}
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
          ))
        )}
      </View>
    </BottomSheet>
  )
}

export type { SortOption }
