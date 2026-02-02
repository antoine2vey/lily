import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { ListRow } from 'src/components/ListRow'
import { useIconColors } from 'src/hooks/useIconColors'

interface PlantOptionsSheetProps {
  visible: boolean
  onClose: () => void
  plantName: string
  isFavorite: boolean
  onEdit: () => void
  onToggleFavorite: () => void
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
  onShare,
  onDelete,
}: PlantOptionsSheetProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()

  const handleAction = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="pb-2">
        <Text className="text-lg text-center font-semibold text-text-primary">
          {t('detail.options.title')}
        </Text>
        <Text
          className="text-sm text-center mt-1 font-regular text-text-muted"
          testID="plant-options-name"
        >
          {plantName}
        </Text>
      </View>

      <View className="mt-4">
        <ListRow
          leftIcon={
            <MaterialIcons name="edit" size={20} color={iconColors.primary} />
          }
          title={t('detail.options.editDetails')}
          showChevron
          onPress={handleAction(onEdit)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={20}
              color={isFavorite ? iconColors.coral : iconColors.primary}
            />
          }
          title={
            isFavorite
              ? t('detail.options.removeFromFavorites')
              : t('detail.options.setAsFavorite')
          }
          onPress={handleAction(onToggleFavorite)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons name="share" size={20} color={iconColors.primary} />
          }
          title={t('detail.options.shareProfile')}
          onPress={handleAction(onShare)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons name="delete" size={20} color={iconColors.coral} />
          }
          title={t('detail.options.deletePlant')}
          destructive
          onPress={handleAction(onDelete)}
        />
      </View>
    </BottomSheet>
  )
}
