import { MaterialIcons } from '@expo/vector-icons'
import { nowAsIsoString } from '@lily/shared'
import { Array as Arr, Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { FormTextArea } from 'src/components/FormTextArea'
import { useCreateDelegation } from 'src/hooks/useCreateDelegation'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlants } from 'src/hooks/usePlants'
import { CaretakerPicker } from 'src/screens/delegation-create/components/CaretakerPicker'
import { DateRangePicker } from 'src/screens/delegation-create/components/DateRangePicker'
import { PlantSelector } from 'src/screens/delegation-create/components/PlantSelector'

interface SelectedUser {
  id: string
  name: string | null
  image: string | null
}

type FormError = string | null

export function DelegationCreateScreen() {
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const { mutate: createDelegation, isPending } = useCreateDelegation()
  const { data: plantsData } = usePlants({ limit: '100' })

  const [selectedCaretaker, setSelectedCaretaker] =
    useState<SelectedUser | null>(null)
  const [selectedPlantIds, setSelectedPlantIds] = useState<
    ReadonlyArray<string>
  >([])
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState<FormError>(null)

  const allPlantIds = pipe(
    Option.fromNullable(plantsData?.items),
    Option.map(Arr.map((p: { id: string }) => p.id)),
    Option.getOrElse(() => [] as ReadonlyArray<string>)
  )

  const handleTogglePlant = useCallback((plantId: string) => {
    setSelectedPlantIds((prev) =>
      Arr.contains(prev, plantId)
        ? Arr.filter(prev, (id) => id !== plantId)
        : [...prev, plantId]
    )
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedPlantIds(allPlantIds)
  }, [allPlantIds])

  const handleDeselectAll = useCallback(() => {
    setSelectedPlantIds([])
  }, [])

  const isFormValid =
    selectedCaretaker !== null &&
    Arr.isNonEmptyArray([...selectedPlantIds]) &&
    startDate !== null &&
    endDate !== null

  const handleSubmit = () => {
    if (!isFormValid) return
    setFormError(null)

    const payload = {
      payload: {
        caretakerId: selectedCaretaker.id,
        plantIds: [...selectedPlantIds] as string[],
        startDate: pipe(
          Option.fromNullable(startDate),
          Option.map((d) => d.toISOString()),
          Option.getOrElse(() => nowAsIsoString())
        ),
        endDate: pipe(
          Option.fromNullable(endDate),
          Option.map((d) => d.toISOString()),
          Option.getOrElse(() => nowAsIsoString())
        ),
        ...(message.length > 0 ? { message } : {}),
      },
    }

    createDelegation(payload, {
      onSuccess: () => {
        toast.success('Delegation request sent!')
        router.back()
      },
      onError: (error: unknown) => {
        const err = error as { _tag?: string; message?: string }
        const errorMessage = pipe(
          Match.value(
            pipe(
              Option.fromNullable(err._tag),
              Option.getOrElse(() => 'Unknown')
            )
          ),
          Match.when(
            'LimitExceededError',
            () =>
              'You have reached the delegation limit for your plan. Upgrade to create more.'
          ),
          Match.when(
            'DelegationOverlapError',
            () =>
              'Some plants already have an active delegation for this period.'
          ),
          Match.when('DelegationDateError', () =>
            pipe(
              Option.fromNullable(err.message),
              Option.getOrElse(() => 'Invalid date range.')
            )
          ),
          Match.when(
            'CannotDelegateSelfError',
            () => 'You cannot delegate plants to yourself.'
          ),
          Match.orElse(() => 'Failed to create delegation. Please try again.')
        )
        setFormError(errorMessage)
      },
    })
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-4">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text
          className="flex-1 text-lg text-center font-bold text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          New Delegation
        </Text>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-6 mt-2">
            {/* Caretaker Picker */}
            <CaretakerPicker
              selectedUser={selectedCaretaker}
              onSelect={setSelectedCaretaker}
              onClear={() => setSelectedCaretaker(null)}
            />

            {/* Plant Selector */}
            <PlantSelector
              selectedPlantIds={selectedPlantIds}
              onTogglePlant={handleTogglePlant}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />

            {/* Date Range */}
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />

            {/* Message */}
            <FormTextArea
              label="Message (optional)"
              placeholder="Add a note for the caretaker..."
              value={message}
              onChangeText={setMessage}
              maxLength={500}
              showCharacterCount
            />

            {/* Error Message */}
            {formError && (
              <View className="flex-row items-start p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20">
                <MaterialIcons
                  name="error-outline"
                  size={20}
                  color={iconColors.coral}
                />
                <Text className="flex-1 ml-2 text-sm text-coral dark:text-orange-400">
                  {formError}
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={!isFormValid || isPending}
              className={`rounded-xl py-4 px-8 items-center ${
                isFormValid && !isPending
                  ? 'bg-primary active:bg-primary-dark'
                  : 'bg-primary/40'
              }`}
            >
              {isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className="text-white text-base text-center font-semibold"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                >
                  Create Delegation
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
