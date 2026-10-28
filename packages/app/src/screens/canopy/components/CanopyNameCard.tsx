import { CANOPY_NAME_MAX_LENGTH } from '@lily/shared'
import { String as Str } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { toast } from 'sonner-native'
import { useUpdateCanopy } from '@/hooks/useCanopyMutations'
import { useIconColors } from '@/hooks/useIconColors'
import { CanopySection } from '@/screens/canopy/components/CanopySection'

/** Any member renames. Keyed on the saved name by the parent, so a rename from someone else resets the draft. */
export function CanopyNameCard({ name }: { name: string }) {
  const { t } = useTranslation('canopy')
  const iconColors = useIconColors()
  const update = useUpdateCanopy()
  const [draft, setDraft] = useState(name)
  const trimmed = Str.trim(draft)
  const canSave =
    Str.isNonEmpty(trimmed) && trimmed !== name && !update.isPending

  const save = () =>
    update.mutate(
      { name: trimmed },
      {
        onSuccess: () => toast.success(t('detail.renamed')),
        onError: () => toast.error(t('detail.failed')),
      }
    )

  return (
    <CanopySection title={t('detail.nameLabel')}>
      <View className="flex-row items-center px-4 py-2 gap-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          maxLength={CANOPY_NAME_MAX_LENGTH}
          returnKeyType="done"
          onSubmitEditing={() => canSave && save()}
          placeholderTextColor={iconColors.textMuted}
          className="flex-1 py-2 text-lg text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          testID="canopy-rename-input"
        />
        {canSave && (
          <Pressable
            onPress={save}
            className="px-4 py-2 rounded-full bg-primary active:bg-primary-dark"
            testID="canopy-rename-save"
          >
            <Text
              className="text-sm text-white"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {t('detail.save')}
            </Text>
          </Pressable>
        )}
        {update.isPending && <ActivityIndicator color={iconColors.primary} />}
      </View>
    </CanopySection>
  )
}
