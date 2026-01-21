import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Chip } from 'src/components/Chip'
import { SectionHeader } from 'src/components/SectionHeader'
import { Button } from 'src/components/ui/Button'
import { useCreatePlant } from 'src/hooks/useCreatePlant'
import { useIdentifyPlant } from 'src/hooks/useIdentifyPlant'
import { iconColors } from 'src/theme'

interface CareInfoRowProps {
  icon: 'water-drop' | 'wb-sunny' | 'cloud'
  label: string
  value: string
}

function CareInfoRow({ icon, label, value }: CareInfoRowProps) {
  return (
    <View className="flex-row items-center py-3 border-b border-border">
      <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-primary-tint">
        <MaterialIcons name={icon} size={20} color={iconColors.primary} />
      </View>
      <Text className="flex-1 text-base font-regular text-text-primary">
        {label}
      </Text>
      <Text className="text-base font-medium text-text-secondary">{value}</Text>
    </View>
  )
}

function IdentificationLoading() {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={iconColors.primary} />
      <Text className="text-lg mt-4 font-medium text-text-primary">
        Identifying your plant...
      </Text>
      <Text className="text-sm mt-2 font-regular text-text-muted">
        This may take a few seconds
      </Text>
    </View>
  )
}

function IdentificationError({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialIcons name="error-outline" size={64} color={iconColors.coral} />
      <Text className="text-xl text-center mt-4 font-semibold text-text-primary">
        Identification Failed
      </Text>
      <Text className="text-base text-center mt-2 mb-6 font-regular text-text-muted">
        We couldn't identify this plant. Try taking another photo or add it
        manually.
      </Text>
      <Button onPress={onRetry}>Try Again</Button>
    </View>
  )
}

export function AIIdentificationResultsScreen() {
  const params = useLocalSearchParams<{ photoUri?: string }>()
  const photoUri = params.photoUri ? decodeURIComponent(params.photoUri) : ''

  const { data: result, isLoading, error, refetch } = useIdentifyPlant(photoUri)
  const { mutate: createPlant, isPending: isCreating } = useCreatePlant()

  const handleAddToCollection = () => {
    if (!result) return

    createPlant(
      {
        name: result.name,
        species: result.species,
        category: result.category,
        imageUri: photoUri,
        wateringFrequency: result.suggestedWateringDays,
        fertilizingFrequency: result.suggestedFertilizingDays,
        lightNeeds: result.lightNeeds,
        waterNeeds: result.waterNeeds,
        humidityNeeds: result.humidityNeeds,
      },
      {
        onSuccess: (plant) => {
          router.replace(`/plant/${plant.id}`)
        },
      }
    )
  }

  const handleEdit = () => {
    if (!result) return
    router.push(
      `/add-plant/manual-basic?prefillName=${encodeURIComponent(result.name)}&prefillCategory=${encodeURIComponent(result.category)}`
    )
  }

  const handleRetry = () => {
    router.push('/add-plant/ai-scanner')
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <IdentificationLoading />
      </SafeAreaView>
    )
  }

  if (error || !result) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <IdentificationError onRetry={() => refetch()} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="relative">
          <Image
            source={{ uri: photoUri }}
            className="w-full"
            style={{ aspectRatio: 4 / 3 }}
            resizeMode="cover"
          />
          <Pressable
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons name="close" size={24} color={iconColors.white} />
          </Pressable>
          <View className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-primary">
            <Text className="text-sm font-semibold text-white">
              {result.confidence}% Match
            </Text>
          </View>
        </View>

        <View className="px-6 py-4">
          <Text className="text-2xl font-bold text-text-primary">
            {result.name}
          </Text>
          <Text className="text-base mt-1 font-regular text-text-secondary">
            {result.commonName}
          </Text>

          <View className="flex-row flex-wrap gap-2 mt-4">
            <Chip label={result.category} />
            <Chip label={result.environment} />
          </View>

          <View className="mt-6">
            <SectionHeader title="Suggested Care" />
            <CareInfoRow
              icon="water-drop"
              label="Water"
              value={result.waterNeedsLabel}
            />
            <CareInfoRow
              icon="wb-sunny"
              label="Light"
              value={result.lightNeedsLabel}
            />
            <CareInfoRow
              icon="cloud"
              label="Humidity"
              value={result.humidityNeedsLabel}
            />
          </View>
        </View>
      </ScrollView>

      <View className="px-6 py-4 bg-background">
        <Button
          onPress={handleAddToCollection}
          loading={isCreating}
          disabled={isCreating}
        >
          Add to Collection
        </Button>
        <View className="flex-row justify-center gap-6 mt-4">
          <Pressable onPress={handleEdit}>
            <Text className="text-base font-medium text-primary">
              Edit Details
            </Text>
          </Pressable>
          <Pressable onPress={handleRetry}>
            <Text className="text-base font-medium text-primary">
              Try Again
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
