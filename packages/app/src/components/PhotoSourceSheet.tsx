import { MaterialIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { useIconColors } from '@/hooks/useIconColors'

interface PhotoSourceSheetProps {
  visible: boolean
  onClose: () => void
  onPhoto: (uri: string) => void
  aspect?: [number, number]
}

interface PickerOptionProps {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  subtitle: string
  onPress: () => void
}

function PickerOption({ icon, title, subtitle, onPress }: PickerOptionProps) {
  const iconColors = useIconColors()

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-100 dark:bg-slate-800 rounded-[24px] p-4 active:scale-[0.98]"
    >
      <View className="flex-row items-center gap-5">
        <View
          className="w-14 h-14 rounded-full bg-white dark:bg-surface-dark items-center justify-center"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <MaterialIcons name={icon} size={24} color={iconColors.primaryDark} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-text-primary dark:text-white mb-0.5">
            {title}
          </Text>
          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {subtitle}
          </Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={24}
          color={iconColors.slate400}
        />
      </View>
    </Pressable>
  )
}

export function PhotoSourceSheet({
  visible,
  onClose,
  onPhoto,
  aspect = [1, 1],
}: PhotoSourceSheetProps) {
  const { t } = useTranslation('plants')

  const launchAfterClose = useCallback(
    (launcher: () => Promise<void>) => {
      onClose()
      setTimeout(launcher, 400)
    },
    [onClose]
  )

  const handlePickFromGallery = useCallback(() => {
    launchAfterClose(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect,
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        onPhoto(result.assets[0].uri)
      }
    })
  }, [launchAfterClose, onPhoto, aspect])

  const handleTakePhoto = useCallback(() => {
    launchAfterClose(async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') return

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect,
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        onPhoto(result.assets[0].uri)
      }
    })
  }, [launchAfterClose, onPhoto, aspect])

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('detail.addPhoto')}
      snapPoints={['35%']}
    >
      <View className="gap-3">
        <PickerOption
          icon="photo-library"
          title={t('detail.chooseFromGallery')}
          subtitle={t('detail.chooseFromGallerySubtitle')}
          onPress={handlePickFromGallery}
        />
        <PickerOption
          icon="camera-alt"
          title={t('detail.takePhoto')}
          subtitle={t('detail.takePhotoSubtitle')}
          onPress={handleTakePhoto}
        />
      </View>
    </BottomSheet>
  )
}
