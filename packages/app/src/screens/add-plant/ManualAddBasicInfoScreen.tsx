import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from 'src/components/ui/Button'
import { Input } from 'src/components/ui/Input'
import { CategoryPicker } from './components/CategoryPicker'
import { PhotoPicker } from './components/PhotoPicker'
import { WizardHeader } from './components/WizardHeader'

export function ManualAddBasicInfoScreen() {
  const params = useLocalSearchParams<{
    prefillName?: string
    prefillCategory?: string
  }>()

  const [photo, setPhoto] = useState<string | null>(null)
  const [name, setName] = useState(params.prefillName ?? '')
  const [category, setCategory] = useState(params.prefillCategory ?? '')

  const handleNext = () => {
    const basicInfo = encodeURIComponent(
      JSON.stringify({ photo, name, category })
    )
    router.push(`/add-plant/manual-care?basicInfo=${basicInfo}`)
  }

  const canProceed = name.trim().length > 0

  return (
    <SafeAreaView className="flex-1 bg-background">
      <WizardHeader step={1} totalSteps={3} onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-2xl mb-2 mt-4 font-bold text-text-primary">
            Basic Info
          </Text>
          <Text className="text-base mb-6 font-regular text-text-secondary">
            Add a photo and name your plant.
          </Text>

          <PhotoPicker
            photo={photo}
            onPickPhoto={setPhoto}
            placeholder="Tap to add photo"
          />

          <View className="mb-4">
            <Text className="text-sm mb-2 font-medium text-text-primary">
              Nickname or Plant Name <Text className="text-coral">*</Text>
            </Text>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. Monstera Deliciosa"
            />
          </View>

          <CategoryPicker
            value={category}
            onSelect={setCategory}
            label="Category"
          />
        </ScrollView>

        <View className="px-6 py-4 bg-background">
          <Button onPress={handleNext} disabled={!canProceed}>
            Next
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
