import { MaterialIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { Slider } from 'src/components/Slider'
import { ToggleRow } from 'src/components/ToggleRow'
import { Input } from 'src/components/ui/Input'
import { useDeletePlant } from 'src/hooks/useDeletePlant'
import { usePlant } from 'src/hooks/usePlant'
import { useUpdatePlant } from 'src/hooks/useUpdatePlant'
import { iconColors } from 'src/theme'
import { CategoryPicker } from '../add-plant/components/CategoryPicker'

function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color={iconColors.primary} />
    </View>
  )
}

export function EditPlantScreen() {
  const params = useLocalSearchParams<{ plantId?: string }>()
  const plantId = params.plantId ?? ''

  const { data: plant, isLoading } = usePlant(plantId)
  const { mutate: updatePlant, isPending: isSaving } = useUpdatePlant(plantId)
  const { mutate: deletePlant, isPending: isDeleting } = useDeletePlant()

  const [photo, setPhoto] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [watering, setWatering] = useState(50)
  const [light, setLight] = useState(50)
  const [humidity, setHumidity] = useState(50)
  const [petSafe, setPetSafe] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Initialize form with plant data
  useEffect(() => {
    if (plant) {
      setPhoto(plant.imageUrl)
      setName(plant.name)
      setCategory(plant.category ?? '')
      setDescription(plant.description ?? '')
      setWatering(plant.waterNeeds ?? 50)
      setLight(plant.lightNeeds ?? 50)
      setHumidity(plant.humidityNeeds ?? 50)
      setPetSafe(plant.petSafe ?? false)
    }
  }, [plant])

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri)
    }
  }

  const handleSave = () => {
    if (!plant) return

    updatePlant(
      {
        name,
        category,
        description,
        waterNeeds: watering,
        lightNeeds: light,
        humidityNeeds: humidity,
        petSafe,
        newImageUri: photo !== plant.imageUrl ? photo : undefined,
        imageUrl: photo === plant.imageUrl ? plant.imageUrl : undefined,
      },
      {
        onSuccess: () => {
          router.back()
        },
      }
    )
  }

  const handleDelete = () => {
    deletePlant(plantId, {
      onSuccess: () => {
        setShowDeleteConfirm(false)
        router.replace('/(app)/(tabs)/plants')
      },
    })
  }

  if (isLoading || !plant) {
    return <LoadingScreen />
  }

  const hasChanges =
    name !== plant.name ||
    category !== (plant.category ?? '') ||
    description !== (plant.description ?? '') ||
    watering !== (plant.waterNeeds ?? 50) ||
    light !== (plant.lightNeeds ?? 50) ||
    humidity !== (plant.humidityNeeds ?? 50) ||
    petSafe !== (plant.petSafe ?? false) ||
    photo !== plant.imageUrl

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="py-2">
          <Text className="text-base font-regular text-text-secondary">
            Cancel
          </Text>
        </Pressable>
        <Text className="text-lg font-semibold text-text-primary">
          Edit Plant
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
          className="py-2"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={iconColors.primary} />
          ) : (
            <Text
              className={`text-base font-medium ${hasChanges ? 'text-primary' : 'text-text-muted'}`}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo */}
          <View className="items-center py-6">
            <Pressable onPress={handleChangePhoto} className="relative">
              <Image
                source={{ uri: photo }}
                className="w-32 h-32 rounded-2xl bg-border"
              />
              <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center bg-primary">
                <MaterialIcons name="edit" size={18} color={iconColors.white} />
              </View>
            </Pressable>
            <Pressable onPress={handleChangePhoto} className="mt-2">
              <Text className="text-sm font-medium text-primary">
                Change Photo
              </Text>
            </Pressable>
          </View>

          {/* Name */}
          <View className="mb-4">
            <Text className="text-sm mb-2 font-medium text-text-primary">
              Name
            </Text>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Plant name"
            />
          </View>

          {/* Category */}
          <CategoryPicker
            value={category}
            onSelect={setCategory}
            label="Category"
          />

          {/* Description */}
          <View className="mb-4">
            <Text className="text-sm mb-2 font-medium text-text-primary">
              Description
            </Text>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description..."
              multiline
              numberOfLines={3}
              style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </View>

          {/* Care Needs */}
          <Text className="text-lg mb-4 mt-2 font-semibold text-text-primary">
            Care Needs
          </Text>

          <View className="mb-6">
            <Slider
              icon={
                <MaterialIcons
                  name="water-drop"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Watering"
              value={watering}
              onValueChange={setWatering}
              min={0}
              max={100}
              minLabel="Drought tolerant"
              maxLabel="Loves water"
            />
          </View>

          <View className="mb-6">
            <Slider
              icon={
                <MaterialIcons
                  name="wb-sunny"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Light"
              value={light}
              onValueChange={setLight}
              min={0}
              max={100}
              minLabel="Low light"
              maxLabel="Direct sun"
            />
          </View>

          <View className="mb-6">
            <Slider
              icon={
                <MaterialIcons
                  name="cloud"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Humidity"
              value={humidity}
              onValueChange={setHumidity}
              min={0}
              max={100}
              minLabel="Dry air OK"
              maxLabel="High humidity"
            />
          </View>

          {/* Pet Safe */}
          <View className="py-2">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="pets"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Pet Safe"
              description="Is this plant safe for pets?"
              value={petSafe}
              onValueChange={setPetSafe}
            />
          </View>

          {/* Delete Button */}
          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            className="py-4 mt-8 mb-8"
          >
            <Text className="text-base text-center font-medium text-coral">
              Delete Plant
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={`Delete ${plant.name}?`}
        message="This will permanently remove all care history and photos."
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Plant'}
        cancelLabel="Keep Plant"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </SafeAreaView>
  )
}
