import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { iconColors } from 'src/theme'

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
  return (
    <View testID="gallery-section">
      <SectionHeader
        title="Gallery"
        action={
          photos.length > 0
            ? { label: 'See All', onPress: onSeeAll }
            : undefined
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-4 -mx-4 px-4"
        contentContainerStyle={{ gap: 8 }}
        testID="gallery-scroll"
      >
        {/* Add Photo Button */}
        <Pressable
          onPress={onAddPhoto}
          className="w-20 h-20 rounded-lg items-center justify-center border-2 border-dashed border-border"
          testID="add-photo-button"
        >
          <MaterialIcons name="add" size={24} color={iconColors.primary} />
        </Pressable>

        {/* Photo Thumbnails */}
        {Array.map(photos, (photo) => (
          <Pressable
            key={photo.id}
            onPress={() => onPhotoPress(photo.id)}
            testID={`photo-${photo.id}`}
          >
            <Image
              source={{ uri: photo.url }}
              className="w-20 h-20 rounded-lg"
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}
