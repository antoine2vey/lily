import {
  CANOPY_MAX_MEMBERS,
  type Canopy,
  formatShortDate,
  parseApiDate,
} from '@lily/shared'
import { Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, Share, Text, View } from 'react-native'
import { toast } from 'sonner-native'
import { Button } from '@/components/ui'
import {
  useCreateCanopyInvite,
  useRevokeCanopyInvite,
} from '@/hooks/useCanopyMutations'
import { CanopySection } from '@/screens/canopy/components/CanopySection'

/**
 * The API returns an invite URL only when it creates one, so every share makes
 * a fresh link, which turns off the previous one.
 */
export function CanopyInviteCard({ canopy }: { canopy: Canopy }) {
  const { t, i18n } = useTranslation('canopy')
  const create = useCreateCanopyInvite()
  const revoke = useRevokeCanopyInvite()
  const isFull = canopy.members.length >= CANOPY_MAX_MEMBERS

  const activeUntil = pipe(
    Option.fromNullishOr(canopy.invite),
    Option.flatMap((invite) => parseApiDate(invite.expiresAt)),
    Option.map((expiresAt) => formatShortDate(expiresAt, i18n.language))
  )

  const share = () =>
    create.mutate(undefined, {
      onSuccess: ({ url }) =>
        Share.share({
          message: t('detail.invite.shareMessage', { name: canopy.name, url }),
        }),
      onError: () => toast.error(t('detail.failed')),
    })

  const confirmRevoke = () =>
    Alert.alert(
      t('detail.invite.revokeTitle'),
      t('detail.invite.revokeMessage'),
      [
        { text: t('join.notNow'), style: 'cancel' },
        {
          text: t('detail.invite.revoke'),
          style: 'destructive',
          onPress: () =>
            revoke.mutate(undefined, {
              onSuccess: () => toast.success(t('detail.invite.revoked')),
              onError: () => toast.error(t('detail.failed')),
            }),
        },
      ]
    )

  return (
    <CanopySection title={t('detail.invite.title')}>
      <View className="p-4 gap-4">
        <Text className="text-sm leading-relaxed text-text-secondary dark:text-slate-300">
          {isFull
            ? t('detail.invite.full', { max: CANOPY_MAX_MEMBERS })
            : t('detail.invite.description')}
        </Text>
        {!isFull && (
          <Button
            icon="ios-share"
            onPress={share}
            loading={create.isPending}
            disabled={create.isPending}
            testID="canopy-invite-share"
          >
            {t('detail.invite.share')}
          </Button>
        )}
        {Option.match(activeUntil, {
          onNone: () => null,
          onSome: (date) => (
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-xs text-text-muted dark:text-slate-400">
                {t('detail.invite.activeUntil', { date })}
              </Text>
              <Pressable
                onPress={confirmRevoke}
                hitSlop={8}
                testID="canopy-invite-revoke"
              >
                <Text className="text-sm font-medium text-coral">
                  {t('detail.invite.revoke')}
                </Text>
              </Pressable>
            </View>
          ),
        })}
      </View>
    </CanopySection>
  )
}
