import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, Order, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BottomSheet } from 'src/components/BottomSheet'
import { EmptyState } from 'src/components/EmptyState'
import { useEffectQuery } from 'src/utils/client'
import { PlantCard } from './components/PlantCard'
import { type FilterOption, PlantFilters } from './components/PlantFilters'
import { PlantSearchBar } from './components/PlantSearchBar'
import {
  type SortOption,
  SortOptionsSheet,
} from './components/SortOptionsSheet'
import { type ViewMode, ViewToggle } from './components/ViewToggle'

type HealthStatus = 'healthy' | 'attention' | 'critical'

interface PlantCardData {
  id: string
  name: string
  imageUrl?: string
  health: HealthStatus
  daysUntilWater?: number
  needsWater?: boolean
}

const mapApiHealthToCardHealth = (health: string): HealthStatus =>
  pipe(
    Match.value(health),
    Match.when('HEALTHY', () => 'healthy' as const),
    Match.when('THRIVING', () => 'healthy' as const),
    Match.when('NEEDS_ATTENTION', () => 'attention' as const),
    Match.when('SICK', () => 'critical' as const),
    Match.orElse(() => 'healthy' as const)
  )

const getDaysUntilWater = (
  nextWateringAt: Date | null | undefined
): Option.Option<number> => {
  if (!nextWateringAt) return Option.none()
  const now = new Date()
  const diffMs = nextWateringAt.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return Option.some(Math.max(0, diffDays))
}

const plantNameOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.string,
  (plant) => plant.name
)

const plantWaterOrder: Order.Order<PlantCardData> = Order.mapInput(
  Order.number,
  (plant) => plant.daysUntilWater ?? 999
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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>('all')
  const [sortOption, setSortOption] = useState<SortOption>('name')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showAddPlant, setShowAddPlant] = useState(false)

  const { data: plantsData, isLoading } = useEffectQuery(
    'plants',
    'getPlants',
    {
      urlParams: { page: '1', limit: '50', filter: 'all', sort: 'added' },
    }
  )

  const plants: ReadonlyArray<PlantCardData> = useMemo(() => {
    const items = plantsData?.items ?? []
    return Array.map(items, (plant) => {
      const daysOption = getDaysUntilWater(plant.nextWateringAt)
      const days = Option.getOrUndefined(daysOption)
      const needsWater = Option.isSome(daysOption) && daysOption.value <= 0
      return {
        id: plant.id,
        name: plant.name,
        imageUrl: plant.imageUrl ?? undefined,
        health: mapApiHealthToCardHealth(plant.health),
        daysUntilWater: days,
        needsWater,
      }
    })
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
      Match.when('nextWater', () => Array.sort(result, plantWaterOrder)),
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
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-[#f7f7f6]"
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            size="large"
            color="#5B8C5A"
            testID="loading-indicator"
          />
        </View>
      </SafeAreaView>
    )
  }

  if (plants.length === 0) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-[#f7f7f6]"
      >
        <View className="flex-row items-center justify-between px-5 pt-12 pb-2">
          <Text className="text-3xl font-bold tracking-tight text-[#141712]">
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
        <BottomSheet
          visible={showAddPlant}
          onClose={() => setShowAddPlant(false)}
          title="Add Plant"
        >
          <View className="py-4">
            <Pressable
              className="flex-row items-center p-4 bg-white rounded-xl mb-3"
              onPress={() => {
                setShowAddPlant(false)
              }}
            >
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                <MaterialIcons name="camera-alt" size={20} color="#5B8C5A" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-[#141712]">
                  Scan with AI
                </Text>
                <Text className="text-sm text-gray-500">
                  Identify your plant instantly
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
            </Pressable>

            <Pressable
              className="flex-row items-center p-4 bg-white rounded-xl"
              onPress={() => {
                setShowAddPlant(false)
              }}
            >
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                <MaterialIcons name="edit" size={20} color="#5B8C5A" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-[#141712]">
                  Add manually
                </Text>
                <Text className="text-sm text-gray-500">
                  Enter plant details yourself
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
            </Pressable>
          </View>
        </BottomSheet>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-[#f7f7f6]"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-12 pb-2">
        <Text className="text-3xl font-bold tracking-tight text-[#141712]">
          My Plants
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={handleToggleSearch}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-soft"
            testID="search-button"
          >
            <MaterialIcons
              name={showSearch ? 'close' : 'search'}
              size={24}
              color="#141712"
            />
          </Pressable>
          <Pressable
            onPress={() => setShowSortSheet(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-soft"
            testID="sort-button"
          >
            <MaterialIcons name="sort" size={24} color="#141712" />
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
