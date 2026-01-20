import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { ListRow } from 'src/components/ListRow'
import { colors, fonts } from 'src/theme'

interface PlantOptionsSheetProps {
  visible: boolean
  onClose: () => void
  plantName: string
  isFavorite: boolean
  onEdit: () => void
  onToggleFavorite: () => void
  onExportHistory: () => void
  onShare: () => void
  onDelete: () => void
}

export function PlantOptionsSheet({
  visible,
  onClose,
  plantName,
  isFavorite,
  onEdit,
  onToggleFavorite,
  onExportHistory,
  onShare,
  onDelete,
}: PlantOptionsSheetProps) {
  const handleAction = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="pb-2">
        <Text
          className="text-lg text-center"
          style={{ fontFamily: fonts.semiBold, color: colors.textPrimary }}
        >
          Plant Options
        </Text>
        <Text
          className="text-sm text-center mt-1"
          style={{ fontFamily: fonts.regular, color: colors.textMuted }}
          testID="plant-options-name"
        >
          {plantName}
        </Text>
      </View>

      <View className="mt-4">
        <ListRow
          leftIcon={
            <MaterialIcons name="edit" size={20} color={colors.primary} />
          }
          title="Edit Plant Details"
          showChevron
          onPress={handleAction(onEdit)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={20}
              color={isFavorite ? colors.coral : colors.primary}
            />
          }
          title={isFavorite ? 'Remove from Favorites' : 'Set as Favorite'}
          onPress={handleAction(onToggleFavorite)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="file-download"
              size={20}
              color={colors.primary}
            />
          }
          title="Export Care History"
          onPress={handleAction(onExportHistory)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons name="share" size={20} color={colors.primary} />
          }
          title="Share Plant Profile"
          onPress={handleAction(onShare)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons name="delete" size={20} color={colors.coral} />
          }
          title="Delete Plant"
          destructive
          onPress={handleAction(onDelete)}
        />
      </View>
    </BottomSheet>
  )
}
