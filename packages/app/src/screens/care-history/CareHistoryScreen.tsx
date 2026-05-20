import { MaterialIcons } from '@expo/vector-icons'
import type { CareType } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheet } from '@/components/BottomSheet'
import { Chip } from '@/components/Chip'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useCareHistory } from '@/hooks/useCareHistory'
import { useIconColors } from '@/hooks/useIconColors'
import { usePlant } from '@/hooks/usePlant'
import { Timeline } from '@/screens/care-history/components/Timeline'
import { LogCareSheet } from '@/screens/log-care/LogCareSheet'

export function CareHistoryScreen() {
  const { t } = useTranslation('care')
  const iconColors = useIconColors()
  const FILTER_OPTIONS: Array<{ type: CareType | 'all'; label: string }> = [
    { type: 'all', label: t('history.filterAll') },
    { type: 'watering', label: t('history.watering') },
    { type: 'fertilization', label: t('history.fertilization') },
    { type: 'misting', label: t('history.misting') },
    { type: 'repotting', label: t('history.repotting') },
  ]
  const params = useLocalSearchParams<{ plantId?: string }>()
  const plantId = Option.getOrElse(
    Option.fromNullable(params.plantId),
    () => ''
  )
  const insets = useSafeAreaInsets()

  const { data: plant } = usePlant(plantId)
  const { data: history, isLoading, refetch } = useCareHistory({ plantId })

  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showLogCareSheet, setShowLogCareSheet] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<CareType | 'all'>('all')

  const handleEventPress = (_event: { id: string }) => {
    // Could navigate to event details in the future
  }

  const handleAddLog = () => {
    setShowLogCareSheet(true)
  }

  const handleLogCareSuccess = () => {
    refetch()
  }

  // Filter history based on selected filter
  const filteredHistory =
    selectedFilter === 'all'
      ? history
      : pipe(
          Option.getOrElse(
            Option.fromNullable(history),
            () => [] as NonNullable<typeof history>
          ),
          Array.map((group) => ({
            ...group,
            events: pipe(
              group.events,
              Array.filter((event) => event.type === selectedFilter)
            ),
          })),
          Array.filter((group) => !Array.isEmptyReadonlyArray(group.events))
        )

  if (isLoading && !history) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </View>
    )
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/10 dark:border-slate-700/10">
        {/* Back button */}
        <GlassBackButton />

        {/* Center title */}
        <View className="items-center">
          <Text className="text-base font-bold text-text-primary dark:text-white">
            {t('history.title')}
          </Text>
          {plant && (
            <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
              {plant.name}
            </Text>
          )}
        </View>

        {/* Filter button */}
        <Pressable
          testID="filter-button"
          onPress={() => setShowFilterSheet(true)}
          className="w-10 h-10 rounded-full items-center justify-center"
        >
          <MaterialIcons
            name="tune"
            size={24}
            color={
              selectedFilter !== 'all'
                ? iconColors.primary
                : iconColors.textMuted
            }
          />
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24 }}
      >
        {!filteredHistory || Array.isEmptyReadonlyArray(filteredHistory) ? (
          <EmptyState
            illustration="notification"
            title={t('history.empty.title')}
            description={t('history.empty.subtitle')}
          />
        ) : (
          <Timeline
            testID="timeline"
            groups={filteredHistory}
            onEventPress={handleEventPress}
          />
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        testID="add-log-fab"
        onPress={handleAddLog}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center bg-primary shadow-lg shadow-primary/30"
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <MaterialIcons name="add" size={32} color={iconColors.white} />
      </Pressable>

      {/* Filter Sheet */}
      <BottomSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        title={t('history.filterByType')}
        snapPoints={['40%']}
      >
        <View className="flex-row flex-wrap gap-2 py-4">
          {pipe(
            FILTER_OPTIONS,
            Array.map((option) => (
              <Chip
                key={option.type}
                label={option.label}
                selected={selectedFilter === option.type}
                onPress={() => {
                  setSelectedFilter(option.type)
                  setShowFilterSheet(false)
                }}
              />
            ))
          )}
        </View>
      </BottomSheet>

      {/* Log Care Sheet */}
      <LogCareSheet
        visible={showLogCareSheet}
        onClose={() => setShowLogCareSheet(false)}
        defaultPlantId={plantId}
        defaultPlant={plant}
        onSuccess={handleLogCareSuccess}
      />
    </View>
  )
}
