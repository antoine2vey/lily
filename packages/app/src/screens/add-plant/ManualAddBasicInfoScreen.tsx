import { MaterialIcons } from '@expo/vector-icons'
import { Option, String } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from 'src/components/ui/Button'
import { Input } from 'src/components/ui/Input'
import { useIconColors } from 'src/hooks/useIconColors'
import { CategoryPicker } from 'src/screens/add-plant/components/CategoryPicker'
import { PhotoPicker } from 'src/screens/add-plant/components/PhotoPicker'
import { WizardHeader } from 'src/screens/add-plant/components/WizardHeader'
import { RoomPicker } from 'src/screens/rooms/components/RoomPicker'

export function ManualAddBasicInfoScreen() {
  const { t } = useTranslation('addPlant')
  const params = useLocalSearchParams<{
    prefillName?: string
    prefillCategory?: string
  }>()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()

  const [photo, setPhoto] = useState<string | null>(null)
  const [name, setName] = useState(
    Option.getOrElse(Option.fromNullable(params.prefillName), () => '')
  )
  const [category, setCategory] = useState(
    Option.getOrElse(Option.fromNullable(params.prefillCategory), () => '')
  )
  const [roomId, setRoomId] = useState<string | null>(null)

  const handleNext = () => {
    const basicInfo = encodeURIComponent(
      JSON.stringify({ photo, name, category, roomId })
    )
    router.push(`/add-plant/manual-care?basicInfo=${basicInfo}`)
  }

  const canProceed = String.isNonEmpty(String.trim(name))

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <WizardHeader step={1} totalSteps={3} onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Photo Upload Area */}
          <View className="p-4 pt-6">
            <PhotoPicker photo={photo} onPickPhoto={setPhoto} />
          </View>

          {/* Form Fields */}
          <View className="px-4 gap-6">
            {/* Plant Name Input */}
            <View className="gap-2">
              <Text className="text-base pl-1 font-semibold text-text-primary dark:text-white">
                {t('basicInfo.nameLabel')}{' '}
                <Text className="text-primary">*</Text>
              </Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder={t('basicInfo.namePlaceholder')}
                suffix={
                  <MaterialIcons
                    name="edit"
                    size={20}
                    color={iconColors.textMuted}
                  />
                }
              />
            </View>

            {/* Category Select */}
            <CategoryPicker
              value={category}
              onSelect={setCategory}
              label={t('basicInfo.categoryLabel')}
            />

            {/* Room */}
            <View className="gap-2">
              <Text className="text-base pl-1 font-semibold text-text-primary dark:text-white">
                {t('basicInfo.roomLabel')}
              </Text>
              <RoomPicker value={roomId} onSelect={setRoomId} />
            </View>
          </View>
        </ScrollView>

        {/* Footer / Action Button */}
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pt-4 bg-background dark:bg-background-dark"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Button
            onPress={handleNext}
            disabled={!canProceed}
            pill
            icon="arrow-forward"
          >
            {t('buttons.next')}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
