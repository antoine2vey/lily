import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { ListRow } from '@/components/ListRow'
import { useIconColors } from '@/hooks/useIconColors'
import type { PlantActions } from '@/utils/canopy-plants'

// Canopy rows, each present only when the caller's role allows the action.
interface CanopyOptions {
  canopyName: string
  actions: PlantActions
  muted: boolean
  canEndLife: boolean
  onShareToCanopy: () => void
  onUnshare: () => void
  onToggleMute: () => void
}

interface PlantOptionsSheetProps extends CanopyOptions {
  visible: boolean
  onClose: () => void
  plantName: string
  isFavorite: boolean
  onEdit: () => void
  onToggleFavorite: () => void
  onShare: () => void
  /** Living plant: the primary end-of-life action. */
  onSayGoodbye: () => void
  /** Dead plant: restore from the cemetery. */
  onBringBack: () => void
  /** Dead plant only: permanent deletion. */
  onDelete: () => void
  isDead: boolean
}

export function PlantOptionsSheet({
  visible,
  onClose,
  plantName,
  isFavorite,
  onEdit,
  onToggleFavorite,
  onShare,
  onSayGoodbye,
  onBringBack,
  onDelete,
  isDead,
  canopyName,
  actions,
  muted,
  canEndLife,
  onShareToCanopy,
  onUnshare,
  onToggleMute,
}: PlantOptionsSheetProps) {
  const { t } = useTranslation('plants')
  const { t: tCanopy } = useTranslation('canopy')
  const { t: tCemetery } = useTranslation('cemetery')
  const iconColors = useIconColors()

  const handleAction = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    // A Canopy plant can carry up to seven rows: the sheet opens tall enough
    // for all of them and scrolls on shorter screens.
    <BottomSheet visible={visible} onClose={onClose} snapPoints={['75%']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        testID="plant-options-scroll"
      >
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
              <MaterialIcons
                name="share"
                size={20}
                color={iconColors.primary}
              />
            }
            title={t('detail.options.shareProfile')}
            onPress={handleAction(onShare)}
          />
          {actions.shareToCanopy && (
            <ListRow
              testID="option-share-canopy"
              leftIcon={
                <MaterialIcons
                  name="groups"
                  size={20}
                  color={iconColors.primary}
                />
              }
              title={tCanopy('actions.share', { name: canopyName })}
              onPress={handleAction(onShareToCanopy)}
            />
          )}
          {actions.mute && (
            <ListRow
              testID="option-mute"
              leftIcon={
                <MaterialIcons
                  name={muted ? 'notifications-active' : 'notifications-off'}
                  size={20}
                  color={iconColors.primary}
                />
              }
              title={tCanopy(muted ? 'actions.unmute' : 'actions.mute')}
              onPress={handleAction(onToggleMute)}
            />
          )}
          {actions.unshare && (
            <ListRow
              testID="option-unshare"
              leftIcon={
                <MaterialIcons
                  name="person"
                  size={20}
                  color={iconColors.primary}
                />
              }
              title={tCanopy('actions.unshare')}
              onPress={handleAction(onUnshare)}
            />
          )}
          {!canEndLife ? null : isDead ? (
            <>
              <ListRow
                leftIcon={
                  <MaterialIcons
                    name="restore"
                    size={20}
                    color={iconColors.primary}
                  />
                }
                title={tCemetery('actions.bringBack')}
                onPress={handleAction(onBringBack)}
              />
              {actions.delete && (
                <ListRow
                  testID="option-delete"
                  leftIcon={
                    <MaterialIcons
                      name="delete"
                      size={20}
                      color={iconColors.coral}
                    />
                  }
                  title={tCemetery('actions.deletePermanently')}
                  destructive
                  onPress={handleAction(onDelete)}
                />
              )}
            </>
          ) : (
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="local-florist"
                  size={20}
                  color={iconColors.textMuted}
                />
              }
              title={tCemetery('actions.sayGoodbye')}
              onPress={handleAction(onSayGoodbye)}
            />
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  )
}
