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
  Switch,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FormInput, FormTextArea } from 'src/components'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { SectionHeader } from 'src/components/SectionHeader'
import { Slider } from 'src/components/Slider'
import { useDeletePlant } from 'src/hooks/useDeletePlant'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlant } from 'src/hooks/usePlant'
import { useUpdatePlant } from 'src/hooks/useUpdatePlant'
import { CategoryPicker } from '../add-plant/components/CategoryPicker'
import { FrequencyPicker } from '../add-plant/components/FrequencyPicker'

function LoadingScreen({
  iconColors,
}: {
  iconColors: ReturnType<typeof useIconColors>
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background dark:bg-background-dark">
      <ActivityIndicator size="large" color={iconColors.primary} />
    </View>
  )
}

export function EditPlantScreen() {
  const params = useLocalSearchParams<{ plantId?: string }>()
  const plantId = params.plantId ?? ''
  const iconColors = useIconColors()

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
  const [wateringFrequencyDays, setWateringFrequencyDays] = useState(7)
  const [fertilizationFrequencyDays, setFertilizationFrequencyDays] = useState<
    number | null
  >(null)
  const [fertilizationEnabled, setFertilizationEnabled] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Initialize form with plant data
  useEffect(() => {
    if (plant) {
      setPhoto(plant.imageUrl ?? undefined)
      setName(plant.name)
      setCategory(plant.category ?? '')
      setDescription(plant.description ?? '')
      setWatering(plant.wateringRating ?? 50)
      setLight(plant.lightingRating ?? 50)
      setHumidity(plant.humidityRating ?? 50)
      setPetSafe(plant.petToxicityRating === 0)
      setWateringFrequencyDays(plant.wateringFrequencyDays)
      setFertilizationFrequencyDays(plant.fertilizationFrequencyDays ?? null)
      setFertilizationEnabled(plant.fertilizationFrequencyDays != null)
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
        path: { id: plantId },
        payload: {
          name,
          category,
          description,
          wateringRating: watering,
          lightingRating: light,
          humidityRating: humidity,
          petToxicityRating: petSafe ? 0 : 100,
          wateringFrequencyDays,
          fertilizationFrequencyDays: fertilizationEnabled
            ? fertilizationFrequencyDays
            : null,
          imageUrl:
            photo !== plant.imageUrl ? photo : (plant.imageUrl ?? undefined),
        },
      },
      {
        onSuccess: () => {
          router.back()
        },
      }
    )
  }

  const handleDelete = () => {
    deletePlant(
      { path: { id: plantId } },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          router.replace('/(app)/(tabs)/plants')
        },
      }
    )
  }

  if (isLoading || !plant) {
    return <LoadingScreen iconColors={iconColors} />
  }

  const hasChanges =
    name !== plant.name ||
    category !== (plant.category ?? '') ||
    description !== (plant.description ?? '') ||
    watering !== (plant.wateringRating ?? 50) ||
    light !== (plant.lightingRating ?? 50) ||
    humidity !== (plant.humidityRating ?? 50) ||
    petSafe !== (plant.petToxicityRating === 0) ||
    photo !== (plant.imageUrl ?? undefined) ||
    wateringFrequencyDays !== plant.wateringFrequencyDays ||
    (fertilizationEnabled ? fertilizationFrequencyDays : null) !==
      (plant.fertilizationFrequencyDays ?? null)

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/30 dark:border-slate-700/30">
        <Pressable onPress={() => router.back()} className="py-2">
          <Text className="text-base font-medium text-text-secondary">
            Cancel
          </Text>
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white">
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
              className={`text-base font-semibold ${hasChanges ? 'text-primary' : 'text-text-muted'}`}
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
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Photo */}
          <View className="items-center py-8">
            <Pressable onPress={handleChangePhoto} className="relative">
              <Image
                source={{ uri: photo }}
                className="w-28 h-28 rounded-3xl bg-surface dark:bg-surface-dark"
              />
              <View className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full items-center justify-center bg-primary shadow-md">
                <MaterialIcons
                  name="photo-camera"
                  size={18}
                  color={iconColors.white}
                />
              </View>
            </Pressable>
            <Pressable onPress={handleChangePhoto} className="mt-3">
              <Text className="text-sm font-semibold text-primary dark:text-primary-light">
                Change Photo
              </Text>
            </Pressable>
          </View>

          {/* Basic Info Section */}
          <View className="gap-5 mb-8">
            <FormInput
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Plant name"
            />

            <CategoryPicker
              value={category}
              onSelect={setCategory}
              label="Category"
            />

            <FormTextArea
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Add care notes or description..."
            />
          </View>

          {/* Care Needs Section */}
          <View className="mb-8">
            <SectionHeader title="Care Needs" />
            <View className="mt-4 bg-surface dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-border/30 dark:border-slate-700/30 gap-6">
              <Slider
                icon={
                  <MaterialIcons name="water-drop" size={20} color="#60A5FA" />
                }
                label="Watering"
                value={watering}
                onValueChange={setWatering}
                min={0}
                max={100}
                minLabel="Drought tolerant"
                maxLabel="Loves water"
              />

              <Slider
                icon={
                  <MaterialIcons name="wb-sunny" size={20} color="#FB923C" />
                }
                label="Light"
                value={light}
                onValueChange={setLight}
                min={0}
                max={100}
                minLabel="Low light"
                maxLabel="Direct sun"
              />

              <Slider
                icon={<MaterialIcons name="cloud" size={20} color="#2DD4BF" />}
                label="Humidity"
                value={humidity}
                onValueChange={setHumidity}
                min={0}
                max={100}
                minLabel="Dry air OK"
                maxLabel="High humidity"
              />

              {/* Pet Safe Toggle */}
              <View className="flex-row items-center justify-between pt-2 border-t border-border/30 dark:border-slate-700/30">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full items-center justify-center bg-primary/10 dark:bg-primary/20">
                    <MaterialIcons
                      name="pets"
                      size={20}
                      color={iconColors.primary}
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text-primary dark:text-white">
                      Pet Safe
                    </Text>
                    <Text className="text-xs text-text-muted dark:text-slate-400 mt-0.5">
                      Safe for cats and dogs
                    </Text>
                  </View>
                </View>
                <Switch
                  value={petSafe}
                  onValueChange={setPetSafe}
                  trackColor={{
                    false: iconColors.border,
                    true: iconColors.primary,
                  }}
                  thumbColor={iconColors.white}
                  ios_backgroundColor={iconColors.border}
                />
              </View>
            </View>
          </View>

          {/* Care Schedule Section */}
          <View className="mb-8">
            <SectionHeader title="Care Schedule" />
            <View className="mt-4 gap-6">
              <FrequencyPicker
                icon={
                  <MaterialIcons name="water-drop" size={20} color="#60A5FA" />
                }
                label="Watering Schedule"
                value={wateringFrequencyDays}
                onValueChange={setWateringFrequencyDays}
                presets={[
                  { days: 3, label: 'Every 3 days' },
                  { days: 7, label: 'Weekly' },
                  { days: 14, label: 'Bi-weekly' },
                  { days: 30, label: 'Monthly' },
                ]}
              />

              {/* Fertilizing Schedule with Enable Toggle */}
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <MaterialIcons name="eco" size={20} color="#22C55E" />
                    <Text className="text-lg font-bold text-text-primary dark:text-white">
                      Fertilizing Schedule
                    </Text>
                  </View>
                  <Switch
                    value={fertilizationEnabled}
                    onValueChange={(enabled) => {
                      setFertilizationEnabled(enabled)
                      if (enabled && fertilizationFrequencyDays === null) {
                        setFertilizationFrequencyDays(30)
                      }
                    }}
                    trackColor={{
                      false: iconColors.border,
                      true: iconColors.primary,
                    }}
                    thumbColor={iconColors.white}
                    ios_backgroundColor={iconColors.border}
                  />
                </View>

                {fertilizationEnabled &&
                  fertilizationFrequencyDays !== null && (
                    <FrequencyPicker
                      label=""
                      value={fertilizationFrequencyDays}
                      onValueChange={setFertilizationFrequencyDays}
                      presets={[
                        { days: 14, label: 'Bi-weekly' },
                        { days: 30, label: 'Monthly' },
                        { days: 60, label: 'Every 2 months' },
                        { days: 90, label: 'Quarterly' },
                      ]}
                    />
                  )}

                {!fertilizationEnabled && (
                  <View className="bg-surface-tinted dark:bg-slate-800 p-4 rounded-xl">
                    <Text className="text-sm text-text-muted dark:text-slate-400 text-center">
                      Enable to set a fertilizing schedule
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Danger Zone */}
          <View>
            <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-3 ml-1">
              Danger Zone
            </Text>
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              className="bg-surface dark:bg-surface-dark rounded-2xl p-4 border border-error/20 flex-row items-center justify-center gap-2 active:bg-error/5"
            >
              <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
              <Text className="text-base font-semibold text-error">
                Delete Plant
              </Text>
            </Pressable>
          </View>
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
