import { Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { GlassBackButton } from '@/components/GlassBackButton'
import { type SelectedUser, UserPicker } from '@/components/UserPicker'
import { Button } from '@/components/ui'
import { useInviteToCanopy } from '@/hooks/useCanopyMutations'
import { useMyCanopy } from '@/hooks/useMyCanopy'
import type { ApiFailure } from '@/utils/client'

export function CanopyInviteMemberScreen() {
  const { t } = useTranslation('canopy')
  const { t: tCommon } = useTranslation('common')
  const insets = useSafeAreaInsets()
  const invite = useInviteToCanopy()
  const { data } = useMyCanopy()
  const [invitee, setInvitee] = useState<SelectedUser | null>(null)

  const canopyName = pipe(
    Option.fromNullishOr(data?.canopy),
    Option.map(({ name }) => name),
    Option.getOrElse(() => '')
  )

  const submit = (user: SelectedUser) => {
    const name = pipe(
      Option.fromNullishOr(user.name),
      Option.getOrElse(() => tCommon('unknown'))
    )
    invite.mutate(user.id, {
      onSuccess: () => {
        toast.success(t('inviteMember.sent', { name }))
        router.back()
      },
      onError: (error: ApiFailure) =>
        toast.error(
          pipe(
            Match.value(error),
            Match.tag('CanopyInviteeAlreadyMemberError', () =>
              t('inviteMember.alreadyMember', { name })
            ),
            Match.tag('CanopyFullError', () => t('inviteMember.full')),
            Match.orElse(() => t('inviteMember.failed'))
          )
        ),
    })
  }

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
          {t('inviteMember.title')}
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1 px-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 mt-2">
          <UserPicker
            label={t('inviteMember.label')}
            placeholder={t('inviteMember.placeholder')}
            selectedUser={invitee}
            onSelect={setInvitee}
            onClear={() => setInvitee(null)}
          />
          <Text className="text-sm leading-relaxed text-text-secondary dark:text-slate-300">
            {t('inviteMember.description', { name: canopyName })}
          </Text>
          <Button
            onPress={() => Option.map(Option.fromNullishOr(invitee), submit)}
            disabled={invitee === null || invite.isPending}
            loading={invite.isPending}
            testID="canopy-invite-member-submit"
          >
            {t('inviteMember.submit')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
