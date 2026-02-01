import { MaterialIcons } from '@expo/vector-icons'
import { type DateInput, daysUntil, parseApiDate } from '@lily/shared'
import { Array, Match, Option, Order, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EmptyState } from 'src/components/EmptyState'
import { PlantsScreenSkeleton } from 'src/components/skeletons'
import { useIconColors } from 'src/hooks/useIconColors'
import { AddPlantOptionsSheet } from 'src/screens/add-plant/AddPlantOptionsSheet'
import { useEffectQuery } from 'src/utils/client'
import { type HealthStatus, mapApiHealthToCardHealth } from 'src/utils/health'
import { PlantCard } from './components/PlantCard'
import { type FilterOption, PlantFilters } from './components/PlantFilters'
import { PlantSearchBar } from './components/PlantSearchBar'
import {
  type SortOption,
  SortOptionsSheet,
} from './components/SortOptionsSheet'
import { type ViewMode, ViewToggle } from './components/ViewToggle'

interface CareStatus {
  daysUntil?: number
  isOverdue: boolean
}

interface PlantCardData {
  id: string
  name: string
  imageUrl?: string
  health: HealthStatus
  watering: CareStatus
  fertilization: CareStatus
  isFavorite?: boolean
}

const getDaysUntil = (date: DateInput): Option.Option<number> =>
  pipe(
    parseApiDate(date),
    Option.map((dt) => daysUntil(dt))
  )

const getCareStatus = (nextDate: DateInput): CareStatus => {
  const daysOption = getDaysUntil(nextDate)
  if (Option.isNone(daysOption)) {
    return { daysUntil: undefined, isOverdue: false }
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
    // Sort by most urgent care need
    const waterDays = plant.watering.daysUntil ?? 999
    const fertilizeDays = plant.fertilization.daysUntil ?? 999
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

export function PlantsScreen() {
  const router = useRouter()
  const iconColors = useIconColors()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>('all')
  const [sortOption, setSortOption] = useState<SortOption>('name')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showAddPlant, setShowAddPlant] = useState(false)

  const {
    data: plantsData,
    isLoading,
    refetch,
    isRefetching,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: { page: '1', limit: '50', filter: 'all', sort: 'added' },
  })

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const plants: ReadonlyArray<PlantCardData> = useMemo(() => {
    const items = plantsData?.items ?? []
    return Array.map(items, (plant) => ({
      id: plant.id,
      name: plant.name,
      imageUrl: plant.imageUrl ?? undefined,
      health: mapApiHealthToCardHealth(plant.health),
      watering: getCareStatus(plant.nextWateringAt),
      fertilization: getCareStatus(plant.nextFertilizationAt),
      isFavorite: plant.isFavorite,
    }))
  }, [plantsData])

  const filteredPlants = useMemo(() => {
    let result = plants

    if (searchQuery.length > 0) {
      const query = searchQuery.toLowerCase()
      result = Array.filter(result, (plant) =>
        plant.name.toLowerCase().includes(query)
      )
    }

    result = pipe(
      Match.value(selectedFilter),
      Match.when('all', () => result),
      Match.when('healthy', () =>
        Array.filter(result, (plant) => plant.health === 'healthy')
      ),
      Match.when('attention', () =>
        Array.filter(
          result,
          (plant) => plant.health === 'attention' || plant.health === 'critical'
        )
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
  }, [plants, searchQuery, selectedFilter, sortOption])

  const counts = useMemo(
    () => ({
      all: plants.length,
      healthy: Array.filter(plants, (p) => p.health === 'healthy').length,
      attention: Array.filter(
        plants,
        (p) => p.health === 'attention' || p.health === 'critical'
      ).length,
    }),
    [plants]
  )

  const handlePlantPress = useCallback(
    (plantId: string) => {
      router.push(`/plant/${plantId}`)
    },
    [router]
  )

  const handleToggleView = useCallback(() => {
    setViewMode((current) => (current === 'grid' ? 'list' : 'grid'))
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  const handleToggleSearch = useCallback(() => {
    setShowSearch((current) => !current)
    if (showSearch) {
      setSearchQuery('')
    }
  }, [showSearch])

  if (isLoading) {
    return <PlantsScreenSkeleton />
  }

  if (plants.length === 0) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-background dark:bg-background-dark"
      >
        <View className="flex-row items-center justify-between px-5 pt-12 pb-2">
          <Text className="text-3xl font-bold tracking-tight text-text-primary dark:text-white">
            My Plants
          </Text>
        </View>
        <EmptyState
          illustration="plant"
          title="No plants yet"
          description="Start building your collection by adding your first plant"
          action={{
            label: 'Add Plant',
            onPress: () => setShowAddPlant(true),
          }}
        />
        <AddPlantOptionsSheet
          visible={showAddPlant}
          onClose={() => setShowAddPlant(false)}
          onSelectAI={() => router.push('/add-plant/ai-scanner')}
          onSelectScan={() => router.push('/add-plant/nursery-scanner')}
          onSelectManual={() => router.push('/add-plant/manual-basic')}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-12 pb-2">
        <Text className="text-3xl font-bold tracking-tight text-text-primary dark:text-white">
          My Plants
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
          <ViewToggle view={viewMode} onToggle={handleToggleView} />
        </View>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View className="px-5 pb-2">
          <PlantSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClear={handleClearSearch}
          />
        </View>
      )}

      {/* Filter Chips */}
      <PlantFilters
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        counts={counts}
      />

      {/* Plants Grid */}
      <FlatList
        data={filteredPlants}
        numColumns={viewMode === 'grid' ? 2 : 1}
        key={viewMode}
        renderItem={({ item }) => (
          <View className={viewMode === 'grid' ? 'w-1/2 p-2' : 'w-full p-2'}>
            <PlantCard plant={item} onPress={handlePlantPress} />
          </View>
        )}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-3 pb-24 pt-2"
        showsVerticalScrollIndicator={false}
        testID="plants-grid"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={iconColors.primary}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 pt-10">
            <EmptyState
              illustration="search"
              title="No plants found"
              description="Try adjusting your search or filters"
            />
          </View>
        }
      />

      {/* Sort Options Sheet */}
      <SortOptionsSheet
        visible={showSortSheet}
        onClose={() => setShowSortSheet(false)}
        selectedOption={sortOption}
        onSelect={setSortOption}
      />
    </SafeAreaView>
  )
}
