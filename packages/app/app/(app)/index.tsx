import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { Stack } from 'expo-router'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { images } from 'src/assets/images'
import { IconButton } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { colors } from 'src/theme'
import { useEffectQuery } from 'src/utils/client'

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

const formatDate = () => {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'long',
  })
}

export default function HomeScreen() {
  const { state, logout } = useAuth()
  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch,
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

  const hasPlants = (plants?.items.length ?? 0) > 0

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-background"
      >
        <View className="flex-1 px-4">
          {/* Header */}
          <View className="flex-row items-center justify-between py-4">
            <View>
              <Text
                className="text-sm text-text-secondary"
                style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
              >
                {formatDate()}
              </Text>
              <Text
                className="text-2xl text-text-primary"
                style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
              >
                {getGreeting()}, {userName}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <IconButton
                icon="notifications-none"
                color={colors.textSecondary}
                onPress={() => {}}
              />
              <Pressable
                className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
                onPress={logout}
              >
                <MaterialIcons name="person" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Content */}
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : hasPlants ? (
            <FlatList
              data={plants?.items ?? []}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{
                paddingBottom: 24,
              }}
              ListHeaderComponent={
                <View className="mb-4">
                  {/* Stats Cards */}
                  <View className="flex-row gap-3 mb-6">
                    <View className="flex-1 bg-surface rounded-lg p-4 items-center">
                      <Text
                        className="text-2xl text-text-primary"
                        style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
                      >
                        {plants?.items.length ?? 0}
                      </Text>
                      <Text
                        className="text-xs text-text-muted uppercase tracking-wide mt-1"
                        style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                      >
                        Total
                      </Text>
                    </View>
                    <View className="flex-1 bg-surface rounded-lg p-4 items-center">
                      <Text
                        className="text-2xl text-primary"
                        style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
                      >
                        {plants?.items.length ?? 0}
                      </Text>
                      <Text
                        className="text-xs text-text-muted uppercase tracking-wide mt-1"
                        style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                      >
                        Healthy
                      </Text>
                    </View>
                    <View className="flex-1 bg-surface rounded-lg p-4 items-center">
                      <Text
                        className="text-2xl text-warning"
                        style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
                      >
                        0
                      </Text>
                      <Text
                        className="text-xs text-text-muted uppercase tracking-wide mt-1"
                        style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                      >
                        Attention
                      </Text>
                    </View>
                  </View>

                  {/* Section Header */}
                  <View className="flex-row items-center justify-between mb-3">
                    <Text
                      className="text-lg text-text-primary"
                      style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                    >
                      My Plants
                    </Text>
                    <Pressable>
                      <Text
                        className="text-sm text-primary"
                        style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                      >
                        See All
                      </Text>
                    </Pressable>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable className="bg-surface rounded-lg p-4 mb-3 flex-row items-center active:opacity-80">
                  {/* Plant Avatar */}
                  <View className="w-14 h-14 rounded-lg bg-primary-tint items-center justify-center mr-4 overflow-hidden">
                    {item.photoUrl ? (
                      <Image
                        source={{ uri: item.photoUrl }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <MaterialIcons
                        name="eco"
                        size={28}
                        color={colors.primary}
                      />
                    )}
                  </View>
                  {/* Plant Info */}
                  <View className="flex-1">
                    <Text
                      className="text-base text-text-primary"
                      style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                    >
                      {item.name}
                    </Text>
                    {item.species && (
                      <Text
                        className="text-sm text-text-secondary mt-0.5"
                        style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
                      >
                        {item.species}
                      </Text>
                    )}
                    {item.location && (
                      <View className="flex-row items-center mt-1">
                        <MaterialIcons
                          name="location-on"
                          size={12}
                          color={colors.textMuted}
                        />
                        <Text
                          className="text-xs text-text-muted ml-1"
                          style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
                        >
                          {item.location}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Chevron */}
                  <MaterialIcons
                    name="chevron-right"
                    size={24}
                    color={colors.textMuted}
                  />
                </Pressable>
              )}
            />
          ) : (
            /* Empty State */
            <View className="flex-1 items-center justify-center px-6">
              {/* Seedling Pot Image */}
              <View className="w-64 h-64 rounded-lg overflow-hidden mb-8">
                <Image
                  source={images.seedlingPot}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>

              {/* Empty State Text */}
              <Text
                className="text-2xl text-text-primary text-center mb-2"
                style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
              >
                Your garden awaits
              </Text>
              <Text
                className="text-base text-text-secondary text-center mb-8"
                style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
              >
                Add your first plant to start your care{'\n'}journey
              </Text>

              {/* Add Plant Button */}
              <Pressable
                className="bg-primary rounded-xl px-8 py-4 flex-row items-center gap-2 active:bg-primary-dark"
                onPress={() => {}}
              >
                <MaterialIcons name="add" size={20} color={colors.white} />
                <Text
                  className="text-base text-white"
                  style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                >
                  Add Your First Plant
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </>
  )
}
