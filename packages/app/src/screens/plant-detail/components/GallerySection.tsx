import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { PhotoSourceSheet } from 'src/components/PhotoSourceSheet'
import { useIconColors } from 'src/hooks/useIconColors'

interface GallerySectionProps {
  photos: ReadonlyArray<{
    id: string
    url: string
    createdAt: Date
  }>
  onPhotoPress: (photoId: string) => void
  onPhoto: (uri: string) => void
}

export function GallerySection({
  photos,
  onPhotoPress,
  onPhoto,
}: GallerySectionProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  const [showPicker, setShowPicker] = useState(false)

  const handleOpenPicker = useCallback(() => {
    setShowPicker(true)
  }, [])

  const handleClosePicker = useCallback(() => {
    setShowPicker(false)
  }, [])

  return (
    <View testID="gallery-section">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4 px-1">
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('detail.gallery')}
        </Text>
      </View>

      {/* Photos Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4 px-4"
        contentContainerStyle={{ gap: 16, paddingRight: 16 }}
        testID="gallery-scroll"
      >
        {/* Add Photo Button */}
        <Pressable
          onPress={handleOpenPicker}
          className="w-24 h-24 rounded-2xl items-center justify-center border-2 border-dashed border-border dark:border-slate-600 bg-surface-tinted dark:bg-surface-dark active:bg-surface dark:active:bg-primary/10"
          testID="add-photo-button"
        >
          <MaterialIcons
            name="add-a-photo"
            size={24}
            color={iconColors.textMuted}
          />
        </Pressable>

        {/* Photo Thumbnails */}
        {Array.map(photos, (photo) => (
          <Pressable
            key={photo.id}
            onPress={() => onPhotoPress(photo.id)}
            className="active:opacity-80"
            testID={`photo-${photo.id}`}
          >
            <AnimatedImage
              source={{ uri: photo.url }}
              className="w-24 h-24 rounded-2xl"
            />
          </Pressable>
        ))}
      </ScrollView>

      {/* Photo Source Picker */}
      <PhotoSourceSheet
        visible={showPicker}
        onClose={handleClosePicker}
        onPhoto={onPhoto}
      />
    </View>
  )
}
