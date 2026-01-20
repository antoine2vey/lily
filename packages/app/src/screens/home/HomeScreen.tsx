import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
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
import { NotificationBell } from 'src/components/NotificationBell'
import { useAuth } from 'src/contexts/AuthContext'
import { colors, fonts } from 'src/theme'
import { useEffectQuery } from 'src/utils/client'
import { HydrationCard } from './components/HydrationCard'
import { RecentActivity } from './components/RecentActivity'
import { StatsRow } from './components/StatsRow'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function HomeScreen() {
  const { state, logout } = useAuth()
  const _router = useRouter()
  const [showAddPlant, setShowAddPlant] = useState(false)

  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch: refetchPlants,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: { page: '1', limit: '20', filter: 'all', sort: 'added' },
  })

  const userName = pipe(
    Match.value(state),
    Match.when(
      { _tag: 'Authenticated' },
      ({ user }) => user.username ?? user.name ?? 'Gardener'
    ),
    Match.orElse(() => 'Gardener')
  )

  // UserProfile doesn't have an avatar field, so we default to undefined
  const userAvatar: string | undefined = undefined

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
  const now = new Date()
  const plantsNeedingWater = pipe(
    plantList,
    Array.filter((plant) => {
      if (!plant.nextWateringAt) return false
      return new Date(plant.nextWateringAt) <= now
    }),
    Array.take(3),
    Array.map((plant) => ({
      id: plant.id,
      name: plant.name,
      imageUrl: plant.imageUrl ?? undefined,
    }))
  )

  // Mock activities matching design - in real app from care history API
  const recentActivities: Array<{
    id: string
    type: 'watered' | 'fertilized' | 'added' | 'moved' | 'misted' | 'pruned'
    plantName: string
    timestamp: Date
    plantImageUrl?: string
  }> = hasPlants
    ? [
        {
          id: '1',
          type: 'misted',
          plantName: 'Fiddle Leaf Fig',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
        },
        {
          id: '2',
          type: 'added',
          plantName: 'Cactus',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        },
        {
          id: '3',
          type: 'moved',
          plantName: 'Aloe Vera',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        },
      ]
    : []

  const onRefresh = async () => {
    await refetchPlants()
  }

  const handleWaterAll = () => {
    // TODO: Implement water all functionality
  }

  const handlePlantPress = (_plantId: string) => {
    // TODO: Navigate to plant detail
  }

  const handleActivityPress = (_activityId: string) => {
    // TODO: Navigate to activity detail
  }

  const handleSeeAllActivities = () => {
    // TODO: Navigate to full history
  }

  const handleNotificationsPress = () => {
    // TODO: Navigate to notifications
  }

  if (isLoading) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-background"
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
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
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View className="flex-1 px-4">
          {/* Header */}
          <View className="flex-row items-center justify-between pt-6 pb-4">
            <View className="flex-1">
              <Text
                className="text-2xl text-text-primary tracking-tight leading-tight"
                style={{ fontFamily: fonts.bold }}
              >
                {getGreeting()},{'\n'}
                {userName} ☀️
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable onPress={logout}>
                <Avatar
                  source={userAvatar ? { uri: userAvatar } : undefined}
                  name={userName}
                  size="md"
                />
              </Pressable>
              <NotificationBell
                unreadCount={0}
                onPress={handleNotificationsPress}
              />
            </View>
          </View>

          {hasPlants ? (
            <View className="gap-4 pb-6">
              {/* Hydration Card */}
              {plantsNeedingWater.length > 0 && (
                <HydrationCard
                  plants={plantsNeedingWater}
                  onWaterAll={handleWaterAll}
                  onPlantPress={handlePlantPress}
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
              // TODO: Navigate to AI scanner
            }}
          >
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
              <MaterialIcons
                name="camera-alt"
                size={20}
                color={colors.primary}
              />
            </View>
            <View className="flex-1">
              <Text
                className="text-base text-text-primary"
                style={{ fontFamily: fonts.semiBold }}
              >
                Scan with AI
              </Text>
              <Text
                className="text-sm text-text-secondary"
                style={{ fontFamily: fonts.regular }}
              >
                Identify your plant instantly
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colors.textMuted}
            />
          </Pressable>

          <Pressable
            className="flex-row items-center p-4 bg-surface rounded-xl"
            onPress={() => {
              setShowAddPlant(false)
              // TODO: Navigate to manual add
            }}
          >
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
              <MaterialIcons name="edit" size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text
                className="text-base text-text-primary"
                style={{ fontFamily: fonts.semiBold }}
              >
                Add manually
              </Text>
              <Text
                className="text-sm text-text-secondary"
                style={{ fontFamily: fonts.regular }}
              >
                Enter plant details yourself
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colors.textMuted}
            />
          </Pressable>
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}
