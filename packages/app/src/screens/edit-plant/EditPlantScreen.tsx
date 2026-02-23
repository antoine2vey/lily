import { MaterialIcons } from '@expo/vector-icons'
import { Option } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FormInput, FormTextArea } from 'src/components'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { PhotoSourceSheet } from 'src/components/PhotoSourceSheet'
import { SectionHeader } from 'src/components/SectionHeader'
import { Slider } from 'src/components/Slider'
import { useDeletePlant } from 'src/hooks/useDeletePlant'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlant } from 'src/hooks/usePlant'
import { useUpdatePlant } from 'src/hooks/useUpdatePlant'
import { CategoryPicker } from 'src/screens/add-plant/components/CategoryPicker'
import { FrequencyPicker } from 'src/screens/add-plant/components/FrequencyPicker'
import { RoomPicker } from 'src/screens/rooms/components/RoomPicker'

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
  const insets = useSafeAreaInsets()
  const { t } = useTranslation(['plantDetail', 'common', 'addPlant'])
  const params = useLocalSearchParams<{ plantId?: string }>()
  const plantId = Option.getOrElse(
    Option.fromNullable(params.plantId),
    () => ''
  )
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
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Initialize form with plant data
  useEffect(() => {
    if (plant) {
      setPhoto(Option.getOrUndefined(Option.fromNullable(plant.imageUrl)))
      setName(plant.name)
      setCategory(
        Option.getOrElse(Option.fromNullable(plant.category), () => '')
      )
      setDescription(
        Option.getOrElse(Option.fromNullable(plant.description), () => '')
      )
      setWatering(
        Option.getOrElse(Option.fromNullable(plant.wateringRating), () => 50)
      )
      setLight(
        Option.getOrElse(Option.fromNullable(plant.lightingRating), () => 50)
      )
      setHumidity(
        Option.getOrElse(Option.fromNullable(plant.humidityRating), () => 50)
      )
      setPetSafe(plant.petToxicityRating === 0)
      setWateringFrequencyDays(plant.wateringFrequencyDays)
      setFertilizationFrequencyDays(
        Option.getOrNull(Option.fromNullable(plant.fertilizationFrequencyDays))
      )
      setFertilizationEnabled(plant.fertilizationFrequencyDays != null)
      setSelectedRoomId(Option.getOrNull(Option.fromNullable(plant.roomId)))
    }
  }, [plant])

  const [showPhotoPicker, setShowPhotoPicker] = useState(false)

  const handleOpenPhotoPicker = useCallback(() => {
    setShowPhotoPicker(true)
  }, [])

  const handleClosePhotoPicker = useCallback(() => {
    setShowPhotoPicker(false)
  }, [])

  const handlePhoto = useCallback((uri: string) => {
    setPhoto(uri)
  }, [])

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
          roomId: selectedRoomId,
          imageUrl:
            photo !== plant.imageUrl
              ? photo
              : Option.getOrUndefined(Option.fromNullable(plant.imageUrl)),
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
    category !==
      Option.getOrElse(Option.fromNullable(plant.category), () => '') ||
    description !==
      Option.getOrElse(Option.fromNullable(plant.description), () => '') ||
    watering !==
      Option.getOrElse(Option.fromNullable(plant.wateringRating), () => 50) ||
    light !==
      Option.getOrElse(Option.fromNullable(plant.lightingRating), () => 50) ||
    humidity !==
      Option.getOrElse(Option.fromNullable(plant.humidityRating), () => 50) ||
    petSafe !== (plant.petToxicityRating === 0) ||
    photo !== Option.getOrUndefined(Option.fromNullable(plant.imageUrl)) ||
    wateringFrequencyDays !== plant.wateringFrequencyDays ||
    (fertilizationEnabled ? fertilizationFrequencyDays : null) !==
      Option.getOrNull(Option.fromNullable(plant.fertilizationFrequencyDays)) ||
    selectedRoomId !== Option.getOrNull(Option.fromNullable(plant.roomId))

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/30 dark:border-slate-700/30">
        <Pressable onPress={() => router.back()} className="py-2">
          <Text className="text-base font-medium text-text-secondary">
            {t('common:buttons.cancel')}
          </Text>
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('plantDetail:edit.title')}
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
              {t('common:buttons.save')}
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
            <Pressable onPress={handleOpenPhotoPicker} className="relative">
              <AnimatedImage
                source={{ uri: photo }}
                className="w-28 h-28 rounded-3xl"
              />
              <View className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full items-center justify-center bg-primary shadow-md">
                <MaterialIcons
                  name="photo-camera"
                  size={18}
                  color={iconColors.white}
                />
              </View>
            </Pressable>
            <Pressable onPress={handleOpenPhotoPicker} className="mt-3">
              <Text className="text-sm font-semibold text-primary dark:text-primary-light">
                {t('plantDetail:edit.changePhoto')}
              </Text>
            </Pressable>
          </View>

          {/* Basic Info Section */}
          <View className="gap-5 mb-8">
            <FormInput
              label={t('plantDetail:edit.nameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('plantDetail:edit.namePlaceholder')}
            />

            <CategoryPicker
              value={category}
              onSelect={setCategory}
              label={t('plantDetail:edit.categoryLabel')}
            />

            <FormTextArea
              label={t('plantDetail:edit.descriptionLabel')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('plantDetail:edit.descriptionPlaceholder')}
            />

            {/* Room Assignment */}
            <View className="gap-2">
              <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
                {t('plantDetail:edit.roomLabel')}
              </Text>
              <RoomPicker value={selectedRoomId} onSelect={setSelectedRoomId} />
            </View>
          </View>

          {/* Care Needs Section */}
          <View className="mb-8">
            <SectionHeader title={t('plantDetail:edit.careNeeds')} />
            <View className="mt-4 bg-surface dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-border/30 dark:border-slate-700/30 gap-6">
              <Slider
                icon={
                  <MaterialIcons name="water-drop" size={20} color="#60A5FA" />
                }
                label={t('addPlant:careNeeds.watering.label')}
                value={watering}
                onValueChange={setWatering}
                min={0}
                max={100}
                minLabel={t('addPlant:careNeeds.watering.low')}
                maxLabel={t('addPlant:careNeeds.watering.high')}
              />

              <Slider
                icon={
                  <MaterialIcons name="wb-sunny" size={20} color="#FB923C" />
                }
                label={t('addPlant:careNeeds.light.label')}
                value={light}
                onValueChange={setLight}
                min={0}
                max={100}
                minLabel={t('addPlant:careNeeds.light.low')}
                maxLabel={t('addPlant:careNeeds.light.high')}
              />

              <Slider
                icon={<MaterialIcons name="cloud" size={20} color="#2DD4BF" />}
                label={t('addPlant:careNeeds.humidity.label')}
                value={humidity}
                onValueChange={setHumidity}
                min={0}
                max={100}
                minLabel={t('addPlant:careNeeds.humidity.low')}
                maxLabel={t('addPlant:careNeeds.humidity.high')}
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
                      {t('plantDetail:edit.petSafe')}
                    </Text>
                    <Text className="text-xs text-text-muted dark:text-slate-400 mt-0.5">
                      {t('plantDetail:edit.petSafeDescription')}
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
            <SectionHeader title={t('plantDetail:edit.careSchedule')} />
            <View className="mt-4 gap-6">
              <FrequencyPicker
                icon={
                  <MaterialIcons name="water-drop" size={20} color="#60A5FA" />
                }
                label={t('addPlant:schedule.watering')}
                value={wateringFrequencyDays}
                onValueChange={setWateringFrequencyDays}
                presets={[
                  {
                    days: 3,
                    label: t('addPlant:schedule.presets.everyThreeDays'),
                  },
                  { days: 7, label: t('addPlant:schedule.presets.weekly') },
                  { days: 14, label: t('addPlant:schedule.presets.biweekly') },
                  { days: 30, label: t('addPlant:schedule.presets.monthly') },
                ]}
              />

              {/* Fertilizing Schedule with Enable Toggle */}
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <MaterialIcons name="eco" size={20} color="#22C55E" />
                    <Text className="text-lg font-bold text-text-primary dark:text-white">
                      {t('addPlant:schedule.fertilizing')}
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
                        {
                          days: 14,
                          label: t('addPlant:schedule.presets.biweekly'),
                        },
                        {
                          days: 30,
                          label: t('addPlant:schedule.presets.monthly'),
                        },
                        {
                          days: 60,
                          label: t('addPlant:schedule.presets.everyTwoMonths'),
                        },
                        {
                          days: 90,
                          label: t('addPlant:schedule.presets.quarterly'),
                        },
                      ]}
                    />
                  )}

                {!fertilizationEnabled && (
                  <View className="bg-surface-tinted dark:bg-slate-800 p-4 rounded-xl">
                    <Text className="text-sm text-text-muted dark:text-slate-400 text-center">
                      {t('addPlant:schedule.enableFertilizing')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Danger Zone */}
          <View>
            <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-3 ml-1">
              {t('plantDetail:edit.dangerZone')}
            </Text>
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              className="bg-surface dark:bg-surface-dark rounded-2xl p-4 border border-error/20 flex-row items-center justify-center gap-2 active:bg-error/5"
            >
              <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
              <Text className="text-base font-semibold text-error">
                {t('plantDetail:edit.deletePlant')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t('plantDetail:delete.title', { name: plant.name })}
        message={t('plantDetail:delete.message')}
        confirmLabel={
          isDeleting
            ? t('common:loading.deleting')
            : t('plantDetail:delete.confirm')
        }
        cancelLabel={t('plantDetail:delete.cancel')}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <PhotoSourceSheet
        visible={showPhotoPicker}
        onClose={handleClosePhotoPicker}
        onPhoto={handlePhoto}
      />
    </View>
  )
}
