import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BottomSheet } from 'src/components/BottomSheet'
import { Chip } from 'src/components/Chip'
import { EmptyState } from 'src/components/EmptyState'
import { useCareHistory } from 'src/hooks/useCareHistory'
import { usePlant } from 'src/hooks/usePlant'
import { iconColors } from 'src/theme'
import { Timeline } from './components/Timeline'

type CareEventType = 'water' | 'fertilize'

const FILTER_OPTIONS: Array<{ type: CareEventType | 'all'; label: string }> = [
  { type: 'all', label: 'All' },
  { type: 'water', label: 'Water' },
  { type: 'fertilize', label: 'Fertilize' },
]

export function CareHistoryScreen() {
  const params = useLocalSearchParams<{ plantId?: string }>()
  const plantId = params.plantId ?? ''

  const { data: plant } = usePlant(plantId)
  const { data: history, isLoading } = useCareHistory({ plantId })

  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<CareEventType | 'all'>(
    'all'
  )

  const handleEventPress = (_event: { id: string }) => {
    // Could navigate to event details in the future
  }

  const handleAddLog = () => {
    router.push(`/log-care?plantId=${plantId}`)
  }

  // Filter history based on selected filter
  const filteredHistory =
    selectedFilter === 'all'
      ? history
      : pipe(
          history ?? [],
          Array.map((group) => ({
            ...group,
            events: pipe(
              group.events,
              Array.filter((event) => event.type === selectedFilter)
            ),
          })),
          Array.filter((group) => group.events.length > 0)
        )

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-lg font-semibold text-text-primary">
            Care History
          </Text>
          {plant && (
            <Text className="text-sm font-regular text-text-muted">
              {plant.name}
            </Text>
          )}
        </View>
        <Pressable
          testID="filter-button"
          onPress={() => setShowFilterSheet(true)}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="filter-list"
            size={24}
            color={
              selectedFilter !== 'all'
                ? iconColors.primary
                : iconColors.textPrimary
            }
          />
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1 px-6 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {!filteredHistory || filteredHistory.length === 0 ? (
          <EmptyState
            illustration="notification"
            title="No care history"
            description="Start logging care activities to see them here"
          />
        ) : (
          <Timeline
            testID="timeline"
            groups={filteredHistory}
            onEventPress={handleEventPress}
          />
        )}
        {/* Bottom spacer for FAB */}
        <View className="h-24" />
      </ScrollView>

      {/* FAB */}
      <Pressable
        testID="add-log-fab"
        onPress={handleAddLog}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center bg-primary shadow-lg"
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.95 : 1 }],
          elevation: 6,
        })}
      >
        <MaterialIcons name="add" size={28} color={iconColors.white} />
      </Pressable>

      {/* Filter Sheet */}
      <BottomSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        title="Filter by Type"
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
    </SafeAreaView>
  )
}
