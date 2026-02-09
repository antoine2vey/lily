import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useDeletePhoto } from 'src/hooks/useDeletePhoto'
import { useIconColors } from 'src/hooks/useIconColors'
import { useEffectQuery } from 'src/utils/client'

export function PhotoViewerScreen() {
  const { t } = useTranslation(['plantDetail', 'common'])
  const iconColors = useIconColors()
  const { plantId, photoId } = useLocalSearchParams<{
    plantId: string
    photoId: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: plant, isLoading } = useEffectQuery('plants', 'getPlant', {
    path: { id: Option.getOrElse(Option.fromNullable(plantId), () => '') },
  })

  const deletePhoto = useDeletePhoto()

  const photo = pipe(
    Option.fromNullable(plant?.photos),
    Option.flatMap((photos) =>
      Array.findFirst(photos, (p) => p.id === photoId)
    ),
    Option.getOrNull
  )

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!plantId || !photoId) return

    deletePhoto.mutate(
      { path: { id: plantId, photoId } },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          router.back()
        },
      }
    )
  }, [deletePhoto, plantId, photoId, router])

  if (isLoading && !plant) {
    return (
      <View
        className="flex-1 bg-black items-center justify-center"
        testID="photo-viewer-loading"
      >
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )
  }

  if (!photo) {
    return (
      <View
        className="flex-1 bg-black items-center justify-center"
        testID="photo-viewer-error"
      >
        <MaterialIcons
          name="broken-image"
          size={48}
          color={iconColors.textMuted}
        />
        <Text className="text-white mt-4 font-medium">
          {t('plantDetail:photoViewer.photoNotFound')}
        </Text>
        <Pressable
          onPress={handleBack}
          className="mt-6 px-6 py-3 rounded-full bg-white/20"
        >
          <Text className="text-white font-semibold">
            {t('common:buttons.goBack')}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-black" testID="photo-viewer-screen">
      {/* Full screen image */}
      <Image
        source={{ uri: photo.url }}
        className="flex-1"
        resizeMode="contain"
        testID="photo-viewer-image"
      />

      {/* Header with back and delete buttons */}
      <View
        className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top + 8 }}
        testID="photo-viewer-header"
      >
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full items-center justify-center bg-black/50"
          testID="photo-viewer-back-button"
        >
          <MaterialIcons name="close" size={24} color="white" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="w-10 h-10 rounded-full items-center justify-center bg-black/50"
          testID="photo-viewer-delete-button"
        >
          <MaterialIcons name="delete" size={24} color={iconColors.coral} />
        </Pressable>
      </View>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t('plantDetail:photoViewer.deleteTitle')}
        message={t('plantDetail:photoViewer.deleteMessage')}
        confirmLabel={t('plantDetail:photoViewer.deleteConfirm')}
        cancelLabel={t('plantDetail:photoViewer.deleteCancel')}
        destructive
        icon={
          <MaterialIcons name="delete" size={32} color={iconColors.coral} />
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </View>
  )
}
