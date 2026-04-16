import { MaterialIcons } from '@expo/vector-icons'
import {
  type DateInput,
  daysUntil,
  getFertilizationSchedule,
  getMistingSchedule,
  getRepottingSchedule,
  getWateringSchedule,
  type PlantOwnership,
  parseApiDate,
} from '@lily/shared'
import { Array, Match, Option, Order, pipe, String } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { PullToRefresh } from '@/components/PullToRefresh'
import { PlantCardSkeleton } from '@/components/skeletons'
import { useTabBarInset } from '@/contexts/TabBarInsetContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useRooms } from '@/hooks/useRooms'
import { PlantCard } from '@/screens/plants/components/PlantCard'
import {
  type FilterOption,
  PlantFilters,
} from '@/screens/plants/components/PlantFilters'
import { PlantSearchBar } from '@/screens/plants/components/PlantSearchBar'
import {
  type SortOption,
  SortOptionsSheet,
} from '@/screens/plants/components/SortOptionsSheet'
import { useEffectQuery } from '@/utils/client'
import {
  type HealthStatus,
  isUnhealthy,
  mapApiHealthToCardHealth,
} from '@/utils/health'

interface CareStatus {
  daysUntil?: number | undefined
  isOverdue: boolean
}

interface PlantCardData {
  id: string
  name: string
  imageUrl?: string | undefined
  health: HealthStatus
  watering: CareStatus
  fertilization: CareStatus
  misting: CareStatus
  repotting: CareStatus
  isFavorite?: boolean | undefined
  roomId?: string | undefined
  roomName?: string | undefined
  roomIcon?: string | undefined
  ownership: PlantOwnership
  ownerName?: string | undefined
}

const getDaysUntil = (date: DateInput): Option.Option<number> =>
  pipe(
    parseApiDate(date),
    Option.map((dt) => daysUntil(dt))
  )

const getCareStatus = (nextDate: DateInput): CareStatus => {
  const daysOption = getDaysUntil(nextDate)
  if (Option.isNone(daysOption)) {
    return { isOverdue: false }
  }
  const days = daysOption.value
  return {
    daysUntil: Math.max(0, days),
    isOverdue: days < 0,
  }
}

const plantNameOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.string,
  (plant) => plant.name
)

const plantCareOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.number,
  (plant) => {
    const waterDays = Option.getOrElse(
      Option.fromNullable(plant.watering.daysUntil),
      () => 999
    )
    const fertilizeDays = Option.getOrElse(
      Option.fromNullable(plant.fertilization.daysUntil),
      () => 999
    )
    return Math.min(waterDays, fertilizeDays)
  }
)

const healthOrderMap: Record<HealthStatus, number> = {
  critical: 0,
  attention: 1,
  healthy: 2,
}

const plantHealthOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.number,
  (plant) => healthOrderMap[plant.health]
)

function PlantsListSkeleton() {
  return (
    <View className="px-5 pt-2 gap-3">
      {Array.map([1, 2, 3, 4, 5, 6], (i) => (
        <PlantCardSkeleton key={i} />
      ))}
    </View>
  )
}

export function PlantsScreen() {
  const { t } = useTranslation('plants')
  const router = useRouter()
  const iconColors = useIconColors()
  const tabBarInset = useTabBarInset()
  const { filter: initialFilter } = useLocalSearchParams<{
    filter?: string
  }>()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>(
    initialFilter === 'needsAttention' ? 'needsAttention' : 'all'
  )
  const [sortOption, setSortOption] = useState<SortOption>('name')
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  const { data: roomsData } = useRooms()

  const insets = useSafeAreaInsets()

  const {
    data: plantsData,
    isLoading,
    refetch,
    isRefetching,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: {
      page: '1',
      limit: '50',
      filter: 'all',
      sort: 'added',
      includeCaretaking: 'true',
    },
  })

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const plants: ReadonlyArray<PlantCardData> = useMemo(() => {
    const items = Option.getOrElse(
      Option.fromNullable(plantsData?.items),
      () => [] as NonNullable<typeof plantsData>['items']
    )
    return Array.map(items, (plant) => {
      const nextWateringAt = pipe(
        getWateringSchedule(plant.schedules),
        Option.flatMap((s) => Option.fromNullable(s.nextCareAt))
      )
      const nextFertilizationAt = pipe(
        getFertilizationSchedule(plant.schedules),
        Option.flatMap((s) => Option.fromNullable(s.nextCareAt))
      )
      const nextMistingAt = pipe(
        getMistingSchedule(plant.schedules),
        Option.flatMap((s) => Option.fromNullable(s.nextCareAt))
      )
      const nextRepottingAt = pipe(
        getRepottingSchedule(plant.schedules),
        Option.flatMap((s) => Option.fromNullable(s.nextCareAt))
      )
      return {
        id: plant.id,
        name: plant.name,
        imageUrl: Option.getOrUndefined(Option.fromNullable(plant.imageUrl)),
        health: mapApiHealthToCardHealth(plant.health),
        watering: getCareStatus(
          Option.getOrElse(nextWateringAt, () => null as DateInput)
        ),
        fertilization: getCareStatus(
          Option.getOrElse(nextFertilizationAt, () => null as DateInput)
        ),
        misting: getCareStatus(
          Option.getOrElse(nextMistingAt, () => null as DateInput)
        ),
        repotting: getCareStatus(
          Option.getOrElse(nextRepottingAt, () => null as DateInput)
        ),
        isFavorite: plant.isFavorite,
        roomId: Option.getOrUndefined(Option.fromNullable(plant.roomId)),
        roomName: Option.getOrUndefined(Option.fromNullable(plant.room?.name)),
        roomIcon: Option.getOrUndefined(Option.fromNullable(plant.room?.icon)),
        ownership: Option.getOrElse(
          Option.fromNullable(plant.ownership),
          () => 'owned' as const
        ),
        ownerName: Option.getOrUndefined(Option.fromNullable(plant.ownerName)),
      }
    })
  }, [plantsData])

  const filteredPlants = useMemo(() => {
    let result = plants

    if (!String.isEmpty(searchQuery)) {
      const query = String.toLowerCase(searchQuery)
      result = Array.filter(result, (plant) =>
        pipe(plant.name, String.toLowerCase, String.includes(query))
      )
    }

    // Room filter
    if (selectedRoomId === 'no-room') {
      result = Array.filter(result, (plant) => !plant.roomId)
    } else if (selectedRoomId !== null) {
      result = Array.filter(result, (plant) => plant.roomId === selectedRoomId)
    }

    result = pipe(
      Match.value(selectedFilter),
      Match.when('all', () => result),
      Match.when('watering', () =>
        Array.filter(result, (plant) => plant.watering.daysUntil === 0)
      ),
      Match.when('fertilizing', () =>
        Array.filter(result, (plant) => plant.fertilization.daysUntil === 0)
      ),
      Match.when('needsAttention', () =>
        Array.filter(result, (plant) => isUnhealthy(plant.health))
      ),
      Match.exhaustive
    )

    result = pipe(
      Match.value(sortOption),
      Match.when('name', () => Array.sort(result, plantNameOrder)),
      Match.when('dateAdded', () => result),
      Match.when('nextWater', () => Array.sort(result, plantCareOrder)),
      Match.when('health', () => Array.sort(result, plantHealthOrder)),
      Match.exhaustive
    )

    return result
  }, [plants, searchQuery, selectedFilter, selectedRoomId, sortOption])

  const counts = useMemo(
    () => ({
      all: Array.length(plants),
      watering: Array.length(
        Array.filter(plants, (p) => p.watering.daysUntil === 0)
      ),
      fertilizing: Array.length(
        Array.filter(plants, (p) => p.fertilization.daysUntil === 0)
      ),
      needsAttention: Array.length(
        Array.filter(plants, (p) => isUnhealthy(p.health))
      ),
    }),
    [plants]
  )

  const handlePlantPress = useCallback(
    (plantId: string) => {
      router.push(`/plant/${plantId}`)
    },
    [router]
  )

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  const handleToggleSearch = useCallback(() => {
    setShowSearch((current) => !current)
    if (showSearch) {
      setSearchQuery('')
    }
  }, [showSearch])

  const isInitialLoading = isLoading && !plantsData
  const showSkeleton = useDelayedLoading(isInitialLoading)
  const hadInitialData = useRef(!!plantsData)

  return (
    <View testID="plants-screen" className="flex-1">
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {/* Header - always rendered */}
        <View className="flex-row items-center justify-between px-5 pt-12 pb-2">
          <Text className="text-3xl font-bold tracking-tight text-text-primary dark:text-white">
            {t('list.title')}
          </Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={handleToggleSearch}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-surface-dark shadow-soft"
              testID="search-button"
            >
              <MaterialIcons
                name={showSearch ? 'close' : 'search'}
                size={24}
                color={iconColors.textPrimary}
              />
            </Pressable>
            <Pressable
              onPress={() => setShowSortSheet(true)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-surface-dark shadow-soft"
              testID="sort-button"
            >
              <MaterialIcons
                name="sort"
                size={24}
                color={iconColors.textPrimary}
              />
            </Pressable>
          </View>
        </View>

        {showSearch && (
          <View className="px-5 pb-2">
            <PlantSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              onClear={handleClearSearch}
            />
          </View>
        )}

        <PlantFilters
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
          counts={counts}
        />

        {/* Room Filter */}
        {roomsData && !Array.isEmptyReadonlyArray(roomsData) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{
              gap: 8,
              paddingHorizontal: 20,
              paddingBottom: 8,
            }}
          >
            <Pressable
              onPress={() => setSelectedRoomId(null)}
              className={`h-8 px-3 rounded-full flex-row items-center ${
                selectedRoomId === null
                  ? 'bg-primary'
                  : 'bg-white dark:bg-surface-dark border border-border dark:border-slate-700'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  selectedRoomId === null
                    ? 'text-white'
                    : 'text-text-primary dark:text-white'
                }`}
              >
                {t('list.filterAll')}
              </Text>
            </Pressable>
            {Array.map(roomsData, (room) => {
              const isSelected = selectedRoomId === room.id
              return (
                <Pressable
                  key={room.id}
                  onPress={() => setSelectedRoomId(isSelected ? null : room.id)}
                  className={`h-8 px-3 rounded-full flex-row items-center gap-1 ${
                    isSelected
                      ? 'bg-primary'
                      : 'bg-white dark:bg-surface-dark border border-border dark:border-slate-700'
                  }`}
                >
                  <Text className="text-xs">{room.icon}</Text>
                  <Text
                    className={`text-xs font-medium ${
                      isSelected
                        ? 'text-white'
                        : 'text-text-primary dark:text-white'
                    }`}
                  >
                    {room.name}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}

        {/* Content */}
        <PullToRefresh isRefreshing={isRefetching} onRefresh={handleRefresh}>
          {(scrollHandler) =>
            showSkeleton ? (
              <Animated.View
                testID="plants-screen-skeleton"
                entering={FadeIn.duration(300)}
              >
                <PlantsListSkeleton />
              </Animated.View>
            ) : isInitialLoading ? null : Array.isEmptyReadonlyArray(plants) ? (
              <Animated.View
                {...(hadInitialData.current
                  ? {}
                  : { entering: FadeIn.duration(300) })}
                className="flex-1"
              >
                <EmptyState
                  illustration="plant"
                  title={t('list.empty.title')}
                  description={t('list.empty.subtitle')}
                  action={{
                    label: t('list.empty.button'),
                    onPress: () => router.push('/add-plant/scanner'),
                  }}
                />
              </Animated.View>
            ) : (
              <Animated.View
                {...(hadInitialData.current
                  ? {}
                  : { entering: FadeIn.duration(300) })}
                className="flex-1"
              >
                <Animated.FlatList
                  data={filteredPlants}
                  renderItem={({ item }) => (
                    <View className="w-full px-2 py-1.5">
                      <PlantCard plant={item} onPress={handlePlantPress} />
                    </View>
                  )}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingBottom: tabBarInset }}
                  contentContainerClassName="px-3 pt-2"
                  showsVerticalScrollIndicator={false}
                  testID="plants-grid"
                  onScroll={scrollHandler}
                  scrollEventThrottle={16}
                  ListEmptyComponent={
                    <View className="flex-1 pt-10">
                      <EmptyState
                        illustration="search"
                        title={t('list.noResults.title')}
                        description={t('list.noResults.subtitle')}
                      />
                    </View>
                  }
                />
              </Animated.View>
            )
          }
        </PullToRefresh>

        <SortOptionsSheet
          visible={showSortSheet}
          onClose={() => setShowSortSheet(false)}
          selectedOption={sortOption}
          onSelect={setSortOption}
        />
      </View>
    </View>
  )
}
