import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { useIconColors } from 'src/hooks/useIconColors'

interface GallerySectionProps {
  photos: ReadonlyArray<{
    id: string
    url: string
    createdAt: Date
  }>
  onPhotoPress: (photoId: string) => void
  onAddPhoto: () => void
  onSeeAll: () => void
}

export function GallerySection({
  photos,
  onPhotoPress,
  onAddPhoto,
  onSeeAll,
}: GallerySectionProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()

  return (
    <View testID="gallery-section">
      {/* Header */}
      <Pressable
        onPress={!Array.isEmptyReadonlyArray(photos) ? onSeeAll : undefined}
        className="flex-row justify-between items-center mb-4 px-1"
      >
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('detail.gallery')}
        </Text>
        {!Array.isEmptyReadonlyArray(photos) && (
          <MaterialIcons
            name="arrow-forward"
            size={20}
            color={iconColors.textMuted}
          />
        )}
      </Pressable>

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
          onPress={onAddPhoto}
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
    </View>
  )
}
