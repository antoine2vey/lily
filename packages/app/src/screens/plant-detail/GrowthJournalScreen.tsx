import { MaterialIcons } from '@expo/vector-icons'
import { StaleTime } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { PhotoSourceSheet } from '@/components/PhotoSourceSheet'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { usePlant } from '@/hooks/usePlant'
import { useUploadPhoto } from '@/hooks/useUploadPhoto'
import { GrowthJournalSkeleton } from '@/screens/plant-detail/components/GrowthJournalSkeleton'
import { GrowthJournalTimeline } from '@/screens/plant-detail/components/GrowthJournalTimeline'
import {
  groupPhotosByMonth,
  type PhotoGroup,
} from '@/screens/plant-detail/growthJournalGrouping'
import { buildGrowingForLabel } from '@/screens/plant-detail/plantAge'
import { useEffectQuery } from '@/utils/client'
import { PHOTOS_LIMIT, PHOTOS_PAGE } from '@/utils/plant-cache'

export function GrowthJournalScreen() {
  const { t, i18n } = useTranslation('plantDetail')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()

  const params = useLocalSearchParams<{ plantId?: string }>()
  const plantId = Option.getOrElse(
    Option.fromNullable(params.plantId),
    () => ''
  )

  const { data: plant } = usePlant(plantId)
  const { data, isLoading } = useEffectQuery(
    'plants',
    'getPlantPhotos',
    {
      path: { id: plantId },
      urlParams: { page: PHOTOS_PAGE, limit: PHOTOS_LIMIT },
    },
    {
      enabled: !!plantId,
      staleTime: StaleTime.default,
    }
  )

  const uploadPhoto = useUploadPhoto()
  const [showPicker, setShowPicker] = useState(false)

  const groups = useMemo(
    () =>
      pipe(
        Option.fromNullable(data),
        Option.map((response) =>
          groupPhotosByMonth(response.items, i18n.language)
        ),
        Option.getOrElse(() => [] as PhotoGroup[])
      ),
    [data, i18n.language]
  )

  const photoCount = pipe(
    Option.fromNullable(data),
    Option.map((response) => response.total),
    Option.getOrElse(() => 0)
  )

  const photoBadge = t('gallery.photoCountBadge', { count: photoCount })
  const pillText = pipe(
    Option.fromNullable(plant),
    Option.match({
      onNone: () => `📸 ${photoBadge}`,
      onSome: (p) =>
        `🌱 ${buildGrowingForLabel(p.dateAdded, t)} · ${photoBadge}`,
    })
  )

  const handlePhotoPress = useCallback(
    (photoId: string) => {
      router.push(`/plant/${plantId}/photo/${photoId}`)
    },
    [plantId]
  )

  const handlePhoto = useCallback(
    (uri: string) => {
      if (!plantId) return
      uploadPhoto.mutate({ plantId, photoUri: uri })
    },
    [plantId, uploadPhoto]
  )

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)
  const isEmpty = Array.isEmptyReadonlyArray(groups)

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/10 dark:border-slate-700/10">
        <GlassBackButton />
        <View className="items-center">
          <Text className="text-base font-bold text-text-primary dark:text-white">
            {t('gallery.journalTitle')}
          </Text>
          {plant && (
            <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
              {plant.name}
            </Text>
          )}
        </View>
        {/* Spacer to keep the title centered against the back button */}
        <View className="w-10 h-10" />
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 96,
        }}
      >
        {showSkeleton ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <GrowthJournalSkeleton />
          </Animated.View>
        ) : isInitialLoading ? null : isEmpty ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <EmptyState
              illustration="plant"
              title={t('gallery.noPhotosTitle')}
              description={t('gallery.noPhotosDescription')}
              action={{
                label: t('gallery.addFirstPhoto'),
                onPress: () => setShowPicker(true),
              }}
            />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(300)}>
            {/* Age + photo-count pill */}
            <View className="self-start mb-6 rounded-full bg-primary-tint dark:bg-primary/15 px-4 py-2">
              <Text className="text-sm font-semibold text-primary-dark dark:text-primary-light">
                {pillText}
              </Text>
            </View>

            <GrowthJournalTimeline
              groups={groups}
              onPhotoPress={handlePhotoPress}
            />
          </Animated.View>
        )}
      </ScrollView>

      {/* Add-photo FAB */}
      <Pressable
        testID="journal-add-photo-fab"
        onPress={() => setShowPicker(true)}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center bg-primary shadow-lg shadow-primary/30"
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <MaterialIcons name="add-a-photo" size={26} color={iconColors.white} />
      </Pressable>

      <PhotoSourceSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onPhoto={handlePhoto}
      />
    </View>
  )
}
