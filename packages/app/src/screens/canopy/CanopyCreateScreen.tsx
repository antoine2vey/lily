import { MaterialIcons } from '@expo/vector-icons'
import { CANOPY_NAME_MAX_LENGTH } from '@lily/shared'
import { Array as Arr, String as Str } from 'effect'
import { router } from 'expo-router'
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
import { toast } from 'sonner-native'
import { FormInput } from '@/components/FormInput'
import { GlassBackButton } from '@/components/GlassBackButton'
import { Button } from '@/components/ui'
import { useCreateCanopy } from '@/hooks/useCanopyMutations'
import { useIconColors } from '@/hooks/useIconColors'
import type { ApiFailure } from '@/utils/client'

const POINTS = [
  { key: 'invite', icon: 'link' },
  { key: 'share', icon: 'local-florist' },
  { key: 'remind', icon: 'notifications-none' },
] as const

export function CanopyCreateScreen() {
  const { t } = useTranslation('canopy')
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const create = useCreateCanopy()
  const [name, setName] = useState('')
  const trimmed = Str.trim(name)
  const canSubmit = Str.isNonEmpty(trimmed) && !create.isPending

  const submit = () =>
    create.mutate(trimmed, {
      onSuccess: () => router.replace('/canopy'),
      onError: (error: ApiFailure) => {
        if (error._tag === 'AlreadyInCanopyError') {
          toast.error(t('create.alreadyIn'))
          router.replace('/canopy')
          return
        }
        toast.error(t('create.failed'))
      },
    })

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center px-4 pt-2 pb-4">
        <GlassBackButton />
        <Text
          className="flex-1 text-lg text-center text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          {t('create.title')}
        </Text>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-6 mt-2">
            <View className="gap-2">
              <FormInput
                label={t('create.nameLabel')}
                placeholder={t('create.namePlaceholder')}
                value={name}
                onChangeText={setName}
                maxLength={CANOPY_NAME_MAX_LENGTH}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => canSubmit && submit()}
                testID="canopy-name-input"
              />
              <Text className="text-xs ml-1 text-text-muted dark:text-slate-400">
                {t('create.hint')}
              </Text>
            </View>

            <View className="bg-surface dark:bg-surface-dark rounded-2xl p-4 gap-4 border border-border/30 dark:border-slate-700/30">
              {Arr.map(POINTS, ({ key, icon }) => (
                <View key={key} className="flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-full bg-primary-tint dark:bg-primary/20 items-center justify-center">
                    <MaterialIcons
                      name={icon}
                      size={18}
                      color={iconColors.primary}
                    />
                  </View>
                  <Text className="flex-1 text-sm leading-relaxed text-text-secondary dark:text-slate-300">
                    {t(`create.points.${key}`)}
                  </Text>
                </View>
              ))}
            </View>

            <Button
              onPress={submit}
              disabled={!canSubmit}
              loading={create.isPending}
              testID="canopy-create-submit"
            >
              {t('create.submit')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
