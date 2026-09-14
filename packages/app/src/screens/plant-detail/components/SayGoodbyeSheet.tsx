import {
  PLANT_DEATH_CAUSES,
  PLANT_DEATH_NOTE_MAX_LENGTH,
  type PlantDeathCause,
} from '@lily/shared'
import { Array, Option, pipe, String } from 'effect'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/Button'
import { useIconColors } from '@/hooks/useIconColors'

export interface SayGoodbyePayload {
  cause: PlantDeathCause
  note?: string
}

interface SayGoodbyeSheetProps {
  visible: boolean
  plantName: string
  isPending?: boolean | undefined
  onClose: () => void
  onConfirm: (payload: SayGoodbyePayload) => void
}

/**
 * The primary "end of life" action for a living plant. One tap is enough
 * (cause defaults to unknown); the note is optional and capped server-side
 * at the same length.
 */
export function SayGoodbyeSheet({
  visible,
  plantName,
  isPending = false,
  onClose,
  onConfirm,
}: SayGoodbyeSheetProps) {
  const { t } = useTranslation('cemetery')
  const iconColors = useIconColors()
  const [cause, setCause] = useState<PlantDeathCause>('unknown')
  const [note, setNote] = useState('')

  // Fresh form every time the sheet opens
  useEffect(() => {
    if (visible) {
      setCause('unknown')
      setNote('')
    }
  }, [visible])

  const handleConfirm = () => {
    const trimmed = String.trim(note)
    onConfirm({
      cause,
      ...pipe(
        Option.liftPredicate(trimmed, String.isNonEmpty),
        Option.match({
          onNone: () => ({}),
          onSome: (value) => ({ note: value }),
        })
      ),
    })
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={['75%']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View className="pb-2">
            <Text
              className="text-lg text-center font-semibold text-text-primary dark:text-white"
              testID="say-goodbye-title"
            >
              {t('sheet.title', { name: plantName })}
            </Text>
            <Text className="text-sm text-center mt-2 font-regular text-text-muted dark:text-slate-400">
              {t('sheet.description', { name: plantName })}
            </Text>
          </View>

          {/* Cause */}
          <View className="mt-6">
            <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
              {t('sheet.causeLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {Array.map(PLANT_DEATH_CAUSES, (value) => (
                <Chip
                  key={value}
                  label={t(`causes.${value}`)}
                  selected={cause === value}
                  onPress={() => setCause(value)}
                  variant="filter"
                />
              ))}
            </View>
          </View>

          {/* Note */}
          <View className="mt-6">
            <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
              {t('sheet.noteLabel')}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('sheet.notePlaceholder')}
              placeholderTextColor={iconColors.textMuted}
              multiline
              numberOfLines={3}
              maxLength={PLANT_DEATH_NOTE_MAX_LENGTH}
              className="w-full bg-surface-tinted dark:bg-slate-800 rounded-xl p-5 text-base font-medium text-text-primary dark:text-white"
              style={{ minHeight: 100, textAlignVertical: 'top' }}
              testID="say-goodbye-note"
            />
          </View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 pt-12 pb-2 bg-white dark:bg-surface-dark">
          <Button
            onPress={handleConfirm}
            loading={isPending}
            disabled={isPending}
            pill
            icon="local-florist"
            iconPosition="left"
            testID="say-goodbye-confirm"
          >
            {t('sheet.confirm')}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  )
}
