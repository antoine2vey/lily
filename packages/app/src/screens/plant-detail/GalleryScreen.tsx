import { MaterialIcons } from '@expo/vector-icons'
import { nowAsDate } from '@lily/shared'
import { Array, Option } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePhotos } from 'src/hooks/usePhotos'
import { useUploadPhoto } from 'src/hooks/useUploadPhoto'

const NUM_COLUMNS = 3
const SPACING = 2
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ITEM_SIZE = (SCREEN_WIDTH - SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS

interface PhotoItem {
  id: string
  url: string
  takenAt: Date
  plantId: string
}

export function GalleryScreen() {
  const { t } = useTranslation('plantDetail')
  const iconColors = useIconColors()
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [page, setPage] = useState(1)
  const { data, isLoading, isFetching } = usePhotos({
    plantId: Option.getOrElse(Option.fromNullable(plantId), () => ''),
    page,
    limit: 30,
  })

  const uploadPhoto = useUploadPhoto()

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleAddPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0] && plantId) {
      uploadPhoto.mutate({
        plantId,
        photoUri: result.assets[0].uri,
      })
    }
  }, [plantId, uploadPhoto])

  const handlePhotoPress = useCallback(
    (photoId: string) => {
      router.push(`/plant/${plantId}/photo/${photoId}`)
    },
    [router, plantId]
  )

  const handleLoadMore = useCallback(() => {
    if (data?.hasMore && !isFetching) {
      setPage((prev) => prev + 1)
    }
  }, [data?.hasMore, isFetching])

  const renderPhoto = useCallback(
    ({ item }: { item: PhotoItem }) => (
      <Pressable
        onPress={() => handlePhotoPress(item.id)}
        style={{
          width: ITEM_SIZE,
          height: ITEM_SIZE,
          margin: SPACING / 2,
        }}
        testID={`gallery-photo-${item.id}`}
      >
        <AnimatedImage
          source={{ uri: item.url }}
          style={{ width: '100%', height: '100%' }}
        />
      </Pressable>
    ),
    [handlePhotoPress]
  )

  const renderHeader = useCallback(
    () => (
      <Pressable
        onPress={handleAddPhoto}
        style={{
          width: ITEM_SIZE,
          height: ITEM_SIZE,
          margin: SPACING / 2,
        }}
        className="items-center justify-center bg-surface-tinted"
        testID="gallery-add-photo-button"
      >
        <MaterialIcons
          name="add-a-photo"
          size={32}
          color={iconColors.primary}
        />
        <Text className="text-xs text-primary mt-2 font-medium">
          {t('gallery.addPhoto')}
        </Text>
      </Pressable>
    ),
    [handleAddPhoto, iconColors.primary, t]
  )

  const renderEmpty = useCallback(
    () => (
      <View
        className="flex-1 items-center justify-center py-12"
        testID="gallery-empty"
      >
        <MaterialIcons
          name="photo-library"
          size={64}
          color={iconColors.textMuted}
        />
        <Text className="text-lg text-text-primary mt-4 font-semibold">
          {t('gallery.noPhotosTitle')}
        </Text>
        <Text className="text-sm text-text-muted mt-2 text-center px-8 font-regular">
          {t('gallery.noPhotosDescription')}
        </Text>
        <Pressable
          onPress={handleAddPhoto}
          className="mt-6 px-6 py-3 rounded-full bg-primary"
        >
          <Text className="text-white font-semibold">
            {t('gallery.addFirstPhoto')}
          </Text>
        </Pressable>
      </View>
    ),
    [handleAddPhoto, iconColors.textMuted, t]
  )

  const renderFooter = useCallback(() => {
    if (!isFetching) return null
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" color={iconColors.primary} />
      </View>
    )
  }, [isFetching, iconColors.primary])

  const photos = Option.getOrElse(
    Option.fromNullable(data?.items),
    () => [] as PhotoItem[]
  )
  const _allItems = Array.prepend(photos, {
    id: 'add-photo-header',
    url: '',
    takenAt: nowAsDate(),
    plantId: Option.getOrElse(Option.fromNullable(plantId), () => ''),
  } as PhotoItem)

  if (isLoading && Array.isEmptyReadonlyArray(photos)) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="gallery-loading"
      >
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" testID="gallery-screen">
      {/* Header */}
      <View
        className="flex-row items-center px-4 pb-4 bg-surface border-b border-border"
        style={{ paddingTop: insets.top + 8 }}
        testID="gallery-header"
      >
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full items-center justify-center"
          testID="gallery-back-button"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-text-primary ml-2 font-semibold">
          {t('gallery.title')}
        </Text>
        <Text className="text-sm text-text-muted font-regular">
          {t('gallery.photoCount', {
            count: Option.getOrElse(Option.fromNullable(data?.total), () => 0),
          })}
        </Text>
      </View>

      {/* Photo Grid */}
      <FlatList
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={{
          padding: SPACING / 2,
          flexGrow: Array.isEmptyReadonlyArray(photos) ? 1 : undefined,
        }}
        ListHeaderComponent={
          !Array.isEmptyReadonlyArray(photos) ? renderHeader : null
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        testID="gallery-grid"
      />
    </View>
  )
}
