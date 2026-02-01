import { MaterialIcons } from '@expo/vector-icons'
import { getTimeBasedGreeting } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Avatar } from 'src/components/Avatar'
import { HomeScreenSkeleton } from 'src/components/skeletons'
import { Button } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { useIconColors } from 'src/hooks/useIconColors'
import { useRecentActivities } from 'src/hooks/useRecentActivities'
import { useUser } from 'src/hooks/useUser'
import { useWaterAll } from 'src/hooks/useWaterAll'
import { AddPlantOptionsSheet } from 'src/screens/add-plant/AddPlantOptionsSheet'
import { useEffectQuery } from 'src/utils/client'
import { HydrationCard } from './components/HydrationCard'
import { RecentActivity } from './components/RecentActivity'
import { StatsRow } from './components/StatsRow'

export function HomeScreen() {
  const { state } = useAuth()
  const router = useRouter()
  const iconColors = useIconColors()
  const [showAddPlant, setShowAddPlant] = useState(false)

  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch: refetchPlants,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: { page: '1', limit: '20', filter: 'all', sort: 'added' },
  })

  const { data: overduePlantsData, refetch: refetchOverdue } = useEffectQuery(
    'plants',
    'getPlants',
    {
      urlParams: { page: '1', limit: '50', filter: 'overdue', sort: 'added' },
    }
  )

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

  // Overdue plants from dedicated API query
  const overduePlantList = overduePlantsData?.items ?? []
  const allOverduePlantIds = Array.map(overduePlantList, (p) => p.id)

  const plantsNeedingWater = pipe(
    overduePlantList,
    Array.take(3),
    Array.map((plant) => ({
      id: plant.id,
      name: plant.name,
      imageUrl: plant.imageUrl ?? undefined,
    }))
  )

  const onRefresh = async () => {
    await Promise.all([refetchPlants(), refetchOverdue(), refetchActivities()])
  }

  const handleWaterAll = () => {
    if (allOverduePlantIds.length > 0) {
      waterAll({ payload: { plantIds: allOverduePlantIds } })
    }
  }

  const handlePlantPress = (plantId: string) => {
    router.push(`/plant/${plantId}`)
  }

  const handleActivityPress = (activityId: string) => {
    // Activity press navigates to the related plant
    const activity = pipe(
      Array.findFirst(recentActivities ?? [], (a) => a.id === activityId)
    )
    pipe(
      activity,
      Option.map((a) => {
        router.push(`/plant/${a.plantId}`)
      })
    )
  }

  const handleSeeAllActivities = () => {
    router.push('/(app)/(tabs)/care')
  }

  if (isLoading) {
    return <HomeScreenSkeleton />
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background dark:bg-background-dark"
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
        <View className="flex-1 px-6">
          {/* Header */}
          <View className="flex-row items-center justify-between pt-8 pb-4">
            <View className="flex-1">
              <Text className="text-2xl text-text-primary dark:text-white tracking-tight leading-tight font-bold">
                {getTimeBasedGreeting()},{'\n'}
                {userName} ☀️
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.push('/settings')}>
                <Avatar
                  source={userAvatar ? { uri: userAvatar } : undefined}
                  name={userName}
                  size="md"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/(app)/notification-settings')}
                className="w-11 h-11 rounded-full bg-white dark:bg-surface-dark items-center justify-center"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                <MaterialIcons
                  name="notifications"
                  size={24}
                  color={iconColors.textPrimary}
                />
              </Pressable>
            </View>
          </View>

          {hasPlants ? (
            <View className="pb-6">
              {/* Hydration Card */}
              {plantsNeedingWater.length > 0 && (
                <View className="mb-8 mt-2">
                  <HydrationCard
                    plants={plantsNeedingWater}
                    onWaterAll={handleWaterAll}
                    onPlantPress={handlePlantPress}
                    isLoading={isWateringAll}
                  />
                </View>
              )}

              {/* Stats Row */}
              <View className="mb-8">
                <StatsRow
                  total={plantList.length}
                  healthy={healthyCount}
                  attention={attentionCount}
                />
              </View>

              {/* Recent Activity */}
              <RecentActivity
                activities={recentActivities}
                onSeeAll={handleSeeAllActivities}
                onActivityPress={handleActivityPress}
              />
            </View>
          ) : (
            /* Empty State */
            <View className="flex-1">
              {/* Typography */}
              <View className="gap-1 mt-4">
                <Text className="text-3xl font-extrabold text-text-primary dark:text-white tracking-tight">
                  Your garden awaits
                </Text>
                <Text className="text-base font-medium text-slate-500 dark:text-slate-400 leading-relaxed w-1/2">
                  Add your first plant to start your care journey
                </Text>
              </View>

              {/* CTA Button */}
              <View className="w-full mt-8">
                <Button
                  icon="add"
                  iconPosition="left"
                  onPress={() => setShowAddPlant(true)}
                  pill
                >
                  Add Your First Plant
                </Button>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Plant Sheet */}
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
