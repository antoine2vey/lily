import { MaterialIcons } from '@expo/vector-icons'
import { getTimeBasedGreeting, isOverdue, parseApiDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { images } from 'src/assets/images'
import { Avatar } from 'src/components/Avatar'
import { BottomSheet } from 'src/components/BottomSheet'
import { EmptyState } from 'src/components/EmptyState'
import { HomeScreenSkeleton } from 'src/components/skeletons'
import { useAuth } from 'src/contexts/AuthContext'
import { useRecentActivities } from 'src/hooks/useRecentActivities'
import { useUser } from 'src/hooks/useUser'
import { useWaterAll } from 'src/hooks/useWaterAll'
import { iconColors } from 'src/theme'
import { useEffectQuery } from 'src/utils/client'
import { HydrationCard } from './components/HydrationCard'
import { RecentActivity } from './components/RecentActivity'
import { StatsRow } from './components/StatsRow'

export function HomeScreen() {
  const { state } = useAuth()
  const router = useRouter()
  const [showAddPlant, setShowAddPlant] = useState(false)

  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch: refetchPlants,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: { page: '1', limit: '20', filter: 'all', sort: 'added' },
  })

  const { data: recentActivities, refetch: refetchActivities } =
    useRecentActivities(5)

  const { mutate: waterAll, isPending: isWateringAll } = useWaterAll()

  const userName = pipe(
    Match.value(state),
    Match.when(
      { _tag: 'Authenticated' },
      ({ user }) => user.username ?? user.name ?? 'Gardener'
    ),
    Match.orElse(() => 'Gardener')
  )

  const { data: userSettings } = useUser()
  const userAvatar = userSettings?.image

  const plantList = plants?.items ?? []
  const hasPlants = plantList.length > 0

  // Calculate stats based on plant health
  const healthyCount = pipe(
    plantList,
    Array.filter((p) => p.health === 'HEALTHY' || p.health === 'THRIVING'),
    (arr) => arr.length
  )
  const attentionCount = pipe(
    plantList,
    Array.filter((p) => p.health === 'NEEDS_ATTENTION' || p.health === 'SICK'),
    (arr) => arr.length
  )

  // Filter plants that need water (nextWateringAt is in the past or today)
  const allOverduePlants = pipe(
    plantList,
    Array.filter((plant) =>
      pipe(
        parseApiDate(plant.nextWateringAt),
        Option.map(isOverdue),
        Option.getOrElse(() => false)
      )
    )
  )

  const allOverduePlantIds = Array.map(allOverduePlants, (p) => p.id)

  const plantsNeedingWater = pipe(
    allOverduePlants,
    Array.take(3),
    Array.map((plant) => ({
      id: plant.id,
      name: plant.name,
      imageUrl: plant.imageUrl ?? undefined,
    }))
  )

  const onRefresh = async () => {
    await Promise.all([refetchPlants(), refetchActivities()])
  }

  const handleWaterAll = () => {
    if (allOverduePlantIds.length > 0) {
      waterAll({ payload: { plantIds: allOverduePlantIds } })
    }
  }

  const handlePlantPress = (plantId: string) => {
    router.push(`/plant/${plantId}`)
  }

  const handleActivityPress = (_activityId: string) => {
    // Activity press navigates to the related plant
    const activity = pipe(
      Array.findFirst(recentActivities ?? [], (a) => a.id === _activityId)
    )
    pipe(
      activity,
      Option.map((a) => {
        router.push(`/plant/${a.plantId}`)
      })
    )
  }

  const handleSeeAllActivities = () => {
    router.push('/(app)/(tabs)/care' as never)
  }

  if (isLoading) {
    return <HomeScreenSkeleton />
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={iconColors.primary}
            colors={[iconColors.primary]}
          />
        }
      >
        <View className="flex-1 px-4">
          {/* Header */}
          <View className="flex-row items-center justify-between pt-6 pb-4">
            <View className="flex-1">
              <Text className="text-2xl text-text-primary tracking-tight leading-tight font-bold">
                {getTimeBasedGreeting()},{'\n'}
                {userName} ☀️
              </Text>
            </View>
            <Pressable onPress={() => router.push('/settings')}>
              <Avatar
                source={userAvatar ? { uri: userAvatar } : undefined}
                name={userName}
                size="md"
              />
            </Pressable>
          </View>

          {hasPlants ? (
            <View className="gap-4 pb-6">
              {/* Hydration Card */}
              {plantsNeedingWater.length > 0 && (
                <HydrationCard
                  plants={plantsNeedingWater}
                  onWaterAll={handleWaterAll}
                  onPlantPress={handlePlantPress}
                  isLoading={isWateringAll}
                />
              )}

              {/* Stats Row */}
              <StatsRow
                total={plantList.length}
                healthy={healthyCount}
                attention={attentionCount}
              />

              {/* Recent Activity */}
              <RecentActivity
                activities={recentActivities}
                onSeeAll={handleSeeAllActivities}
                onActivityPress={handleActivityPress}
              />
            </View>
          ) : (
            /* Empty State */
            <View className="flex-1 items-center justify-center px-6">
              <View className="w-64 h-64 rounded-lg overflow-hidden mb-8">
                <Image
                  source={images.seedlingPot}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>
              <EmptyState
                title="Your garden awaits"
                description="Add your first plant to start your care journey"
                action={{
                  label: 'Add Your First Plant',
                  onPress: () => setShowAddPlant(true),
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Plant Sheet */}
      <BottomSheet
        visible={showAddPlant}
        onClose={() => setShowAddPlant(false)}
        title="Add Plant"
      >
        <View className="py-4">
          <Pressable
            className="flex-row items-center p-4 bg-surface rounded-xl mb-3"
            onPress={() => {
              setShowAddPlant(false)
              router.push('/add-plant/ai-scanner')
            }}
          >
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
              <MaterialIcons
                name="camera-alt"
                size={20}
                color={iconColors.primary}
              />
            </View>
            <View className="flex-1">
              <Text className="text-base text-text-primary font-semibold">
                Scan with AI
              </Text>
              <Text className="text-sm text-text-secondary font-regular">
                Identify your plant instantly
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={iconColors.muted}
            />
          </Pressable>

          <Pressable
            className="flex-row items-center p-4 bg-surface rounded-xl"
            onPress={() => {
              setShowAddPlant(false)
              router.push('/add-plant/manual-basic')
            }}
          >
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
              <MaterialIcons name="edit" size={20} color={iconColors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base text-text-primary font-semibold">
                Add manually
              </Text>
              <Text className="text-sm text-text-secondary font-regular">
                Enter plant details yourself
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={iconColors.muted}
            />
          </Pressable>
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}
