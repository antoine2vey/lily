import {
  LiquidGlassContainerView,
  LiquidGlassView,
} from '@callstack/liquid-glass'
import { MaterialIcons } from '@expo/vector-icons'
import {
  getFertilizationSchedule,
  getMistingSchedule,
  getRepottingSchedule,
  getWateringSchedule,
  type PlantCareSchedule,
  type PlantOwnership,
} from '@lily/shared'
import { Array, Match, Option, Order, pipe, String } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { GlassIconButton } from '@/components/GlassIconButton'
import { PullToRefresh } from '@/components/PullToRefresh'
import { PlantCardSkeleton } from '@/components/skeletons'
import { useTabBarInset } from '@/contexts/TabBarInsetContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useMyCanopy } from '@/hooks/useMyCanopy'
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
import {
  filterByScope,
  PLANT_SCOPES,
  type PlantScope,
} from '@/utils/canopy-plants'
import { useEffectQuery } from '@/utils/client'
import { useGlass } from '@/utils/glass'
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
  canopyName?: string | undefined
}

const getCareStatus = (
  schedule: Option.Option<PlantCareSchedule>
): CareStatus =>
  pipe(
    schedule,
    Option.flatMap((s) => Option.fromNullishOr(s.status)),
    Option.match({
      onNone: (): CareStatus => ({ isOverdue: false }),
      onSome: (status) =>
        pipe(
          Match.value(status),
          Match.tag(
            'Overdue',
            (): CareStatus => ({ daysUntil: 0, isOverdue: true })
          ),
          Match.tag(
            'DueToday',
            (): CareStatus => ({ daysUntil: 0, isOverdue: false })
          ),
          Match.tag(
            'Upcoming',
            ({ inDays }): CareStatus => ({
              daysUntil: inDays,
              isOverdue: false,
            })
          ),
          Match.exhaustive
        ),
    })
  )

const plantNameOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.String,
  (plant) => plant.name
)

const plantCareOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.Number,
  (plant) => {
    const waterDays = Option.getOrElse(
      Option.fromNullishOr(plant.watering.daysUntil),
      () => 999
    )
    const fertilizeDays = Option.getOrElse(
      Option.fromNullishOr(plant.fertilization.daysUntil),
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
  Order.Number,
  (plant) => healthOrderMap[plant.health]
)

function ActionButtons({
  showSearch,
  onSearchPress,
  onSortPress,
  iconColor,
}: {
  showSearch: boolean
  onSearchPress: () => void
  onSortPress: () => void
  iconColor: string
}) {
  const { t } = useTranslation()
  const buttons = (
    <>
      <GlassIconButton
        icon={showSearch ? 'close' : 'search'}
        onPress={onSearchPress}
        accessibilityLabel={t(
          showSearch ? 'common:a11y.closeSearch' : 'common:a11y.openSearch'
        )}
        iconColor={iconColor}
        testID="search-button"
      />
      <GlassIconButton
        icon="sort"
        onPress={onSortPress}
        accessibilityLabel={t('common:a11y.sort')}
        iconColor={iconColor}
        testID="sort-button"
      />
    </>
  )

  if (useGlass) {
    return (
      <LiquidGlassContainerView
        spacing={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        {buttons}
      </LiquidGlassContainerView>
    )
  }

  return <View className="flex-row items-center gap-3">{buttons}</View>
}

function RoomPill({
  isSelected,
  onPress,
  children,
  testID,
}: {
  isSelected: boolean
  onPress: () => void
  children: React.ReactNode
  testID?: string
}) {
  const pressable = (
    <Pressable
      testID={testID}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      className={`h-8 px-3 rounded-full flex-row items-center gap-1 ${
        isSelected ? 'bg-primary' : ''
      }`}
    >
      {children}
    </Pressable>
  )

  if (isSelected) return pressable

  if (useGlass) {
    return (
      <LiquidGlassView interactive={false} style={{ borderRadius: 16 }}>
        {pressable}
      </LiquidGlassView>
    )
  }

  return (
    <View className="bg-white dark:bg-surface-dark border border-border dark:border-slate-700 rounded-full">
      {pressable}
    </View>
  )
}

function PlantsListSkeleton() {
  return (
    <View className="px-6 pt-2 gap-3">
      {Array.map([1, 2, 3, 4, 5, 6], (i) => (
        <PlantCardSkeleton key={i} />
      ))}
    </View>
  )
}

export function PlantsScreen() {
  const { t } = useTranslation(['plants', 'canopy'])
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
  const [selectedScope, setSelectedScope] = useState<PlantScope>('all')

  const { data: roomsData } = useRooms()
  const { data: canopyData } = useMyCanopy()
  // Someone who leaves the Canopy loses the pills, so the scope must not
  // keep hiding their list.
  const inCanopy = canopyData?.canopy != null
  const scope: PlantScope = inCanopy ? selectedScope : 'all'

  const insets = useSafeAreaInsets()

  const {
    data: plantsData,
    isLoading,
    refetch,
    isRefetching,
  } = useEffectQuery('plants', 'getPlants', {
    query: {
      page: '1',
      limit: '50',
      filter: 'all',
      sort: 'added',
      includeCaretaking: 'true',
      includeCanopy: 'true',
    },
  })

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const plants: ReadonlyArray<PlantCardData> = useMemo(() => {
    const items = Option.getOrElse(
      Option.fromNullishOr(plantsData?.items),
      () => [] as NonNullable<typeof plantsData>['items']
    )
    return Array.map(items, (plant) => {
      return {
        id: plant.id,
        name: plant.name,
        imageUrl: Option.getOrUndefined(Option.fromNullishOr(plant.imageUrl)),
        health: mapApiHealthToCardHealth(plant.health),
        watering: getCareStatus(getWateringSchedule(plant.schedules)),
        fertilization: getCareStatus(getFertilizationSchedule(plant.schedules)),
        misting: getCareStatus(getMistingSchedule(plant.schedules)),
        repotting: getCareStatus(getRepottingSchedule(plant.schedules)),
        isFavorite: plant.isFavorite,
        roomId: Option.getOrUndefined(Option.fromNullishOr(plant.roomId)),
        roomName: Option.getOrUndefined(Option.fromNullishOr(plant.room?.name)),
        roomIcon: Option.getOrUndefined(Option.fromNullishOr(plant.room?.icon)),
        ownership: Option.getOrElse(
          Option.fromNullishOr(plant.ownership),
          () => 'owned' as const
        ),
        ownerName: Option.getOrUndefined(Option.fromNullishOr(plant.ownerName)),
        canopyName: Option.getOrUndefined(
          Option.fromNullishOr(plant.canopy?.name)
        ),
      }
    })
  }, [plantsData])

  const scopedPlants = useMemo(
    () => filterByScope(plants, scope),
    [plants, scope]
  )

  const scopedRooms = useMemo(
    () =>
      pipe(
        Option.fromNullishOr(roomsData),
        Option.map((rooms) =>
          pipe(
            Match.value(scope),
            Match.when('all', () => rooms),
            Match.when('mine', () =>
              Array.filter(rooms, (room) => room.canopyId === null)
            ),
            Match.when('canopy', () =>
              Array.filter(rooms, (room) => room.canopyId !== null)
            ),
            Match.exhaustive
          )
        ),
        Option.getOrElse(() => [] as NonNullable<typeof roomsData>)
      ),
    [roomsData, scope]
  )

  const handleScopeChange = useCallback((next: PlantScope) => {
    setSelectedScope(next)
    setSelectedRoomId(null)
  }, [])

  const filteredPlants = useMemo(() => {
    let result = scopedPlants

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
  }, [scopedPlants, searchQuery, selectedFilter, selectedRoomId, sortOption])

  const counts = useMemo(
    () => ({
      all: Array.length(scopedPlants),
      watering: Array.length(
        Array.filter(scopedPlants, (p) => p.watering.daysUntil === 0)
      ),
      fertilizing: Array.length(
        Array.filter(scopedPlants, (p) => p.fertilization.daysUntil === 0)
      ),
      needsAttention: Array.length(
        Array.filter(scopedPlants, (p) => isUnhealthy(p.health))
      ),
    }),
    [scopedPlants]
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
        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
          <Text className="text-2xl font-bold tracking-tight text-text-primary dark:text-white">
            {t('list.title')}
          </Text>
          <ActionButtons
            showSearch={showSearch}
            onSearchPress={handleToggleSearch}
            onSortPress={() => setShowSortSheet(true)}
            iconColor={iconColors.textPrimary}
          />
        </View>

        {showSearch && (
          <View className="px-6 pb-2">
            <PlantSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              onClear={handleClearSearch}
            />
          </View>
        )}

        {inCanopy && (
          <View
            testID="plant-scope-filter"
            className="flex-row gap-2 px-6 pb-2"
          >
            {Array.map(PLANT_SCOPES, (option) => {
              const isSelected = scope === option
              return (
                <RoomPill
                  key={option}
                  testID={`plant-scope-${option}`}
                  isSelected={isSelected}
                  onPress={() => handleScopeChange(option)}
                >
                  <Text
                    className={`text-xs font-medium ${
                      isSelected
                        ? 'text-white'
                        : 'text-text-primary dark:text-white'
                    }`}
                  >
                    {t(`canopy:scope.${option}`)}
                  </Text>
                </RoomPill>
              )
            })}
          </View>
        )}

        <PlantFilters
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
          counts={counts}
        />

        {/* Room Filter */}
        {!Array.isReadonlyArrayEmpty(scopedRooms) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{
              gap: 8,
              paddingHorizontal: 24,
              paddingTop: 6,
              paddingBottom: 8,
            }}
          >
            <RoomPill
              isSelected={selectedRoomId === null}
              onPress={() => setSelectedRoomId(null)}
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
            </RoomPill>
            {Array.map(scopedRooms, (room) => {
              const isSelected = selectedRoomId === room.id
              return (
                <RoomPill
                  key={room.id}
                  isSelected={isSelected}
                  onPress={() => setSelectedRoomId(isSelected ? null : room.id)}
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
                </RoomPill>
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
            ) : isInitialLoading ? null : Array.isReadonlyArrayEmpty(plants) ? (
              <Animated.View
                {...(hadInitialData.current
                  ? {}
                  : { entering: FadeIn.duration(300) })}
                className="flex-1"
              >
                <EmptyState
                  kind="plantsNone"
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
                    <View className="w-full py-1.5">
                      <PlantCard plant={item} onPress={handlePlantPress} />
                    </View>
                  )}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingBottom: tabBarInset }}
                  contentContainerClassName="px-6 pt-2"
                  showsVerticalScrollIndicator={false}
                  testID="plants-grid"
                  onScroll={scrollHandler}
                  scrollEventThrottle={16}
                  ListEmptyComponent={
                    <View className="flex-1 pt-10">
                      <EmptyState kind="plantsNoResults" />
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
