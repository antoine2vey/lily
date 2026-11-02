import {
  CANOPY_MAX_MEMBERS,
  type Canopy,
  type CanopyPendingInvitation,
  formatShortDate,
  parseApiDate,
} from '@lily/shared'
import { Array as Arr, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, Share, Text, View } from 'react-native'
import { toast } from 'sonner-native'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui'
import {
  useCreateCanopyInvite,
  useRevokeCanopyInvite,
  useWithdrawCanopyInvitation,
} from '@/hooks/useCanopyMutations'
import { CanopySection } from '@/screens/canopy/components/CanopySection'

/**
 * The API returns an invite URL only when it creates one, so every share makes
 * a fresh link, which turns off the previous one.
 */
export function CanopyInviteCard({
  canopy,
  myUserId,
}: {
  canopy: Canopy
  myUserId: string
}) {
  const { t, i18n } = useTranslation('canopy')
  const create = useCreateCanopyInvite()
  const revoke = useRevokeCanopyInvite()
  const isFull = canopy.members.length >= CANOPY_MAX_MEMBERS

  const shortDate = (date: Date) =>
    Option.map(parseApiDate(date), (parsed) =>
      formatShortDate(parsed, i18n.language)
    )

  const activeUntil = pipe(
    Option.fromNullishOr(canopy.invite),
    Option.flatMap((invite) => shortDate(invite.expiresAt))
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
          <>
            <Button
              icon="person-add"
              onPress={() => router.push('/canopy-invite-member')}
              testID="canopy-invite-member"
            >
              {t('detail.invite.member')}
            </Button>
            <Button
              variant="secondary"
              icon="ios-share"
              onPress={share}
              loading={create.isPending}
              disabled={create.isPending}
              testID="canopy-invite-share"
            >
              {t('detail.invite.share')}
            </Button>
          </>
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
      {Arr.isReadonlyArrayNonEmpty(canopy.invitations) && (
        <View className="border-t border-border/40 dark:border-slate-700/40">
          <Text className="px-4 pt-3 text-xs uppercase font-medium text-text-muted dark:text-slate-400">
            {t('detail.invite.pending')}
          </Text>
          {Arr.map(canopy.invitations, (invitation) => (
            <PendingInvitationRow
              key={invitation.id}
              invitation={invitation}
              until={shortDate(invitation.expiresAt)}
              canWithdraw={
                canopy.role === 'owner' ||
                invitation.invitedByUserId === myUserId
              }
            />
          ))}
        </View>
      )}
    </CanopySection>
  )
}

function PendingInvitationRow({
  invitation,
  until,
  canWithdraw,
}: {
  invitation: CanopyPendingInvitation
  until: Option.Option<string>
  canWithdraw: boolean
}) {
  const { t } = useTranslation('canopy')
  const withdraw = useWithdrawCanopyInvitation()
  const name = pipe(
    Option.fromNullishOr(invitation.invitee.name),
    Option.getOrElse(() => t('detail.unnamed'))
  )

  const confirmWithdraw = () =>
    Alert.alert(
      t('detail.invite.withdrawTitle', { name }),
      t('detail.invite.withdrawMessage'),
      [
        { text: t('join.notNow'), style: 'cancel' },
        {
          text: t('detail.invite.withdraw'),
          style: 'destructive',
          onPress: () =>
            withdraw.mutate(invitation.id, {
              onSuccess: () => toast.success(t('detail.invite.withdrawn')),
              onError: () => toast.error(t('detail.failed')),
            }),
        },
      ]
    )

  return (
    <View
      className="flex-row items-center px-4 py-3 gap-3"
      testID={`canopy-invitation-${invitation.id}`}
    >
      <Avatar
        source={pipe(
          Option.fromNullishOr(invitation.invitee.image),
          Option.map((uri) => ({ uri })),
          Option.getOrUndefined
        )}
        name={name}
        size="sm"
      />
      <View className="flex-1">
        <Text
          className="text-base text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {Option.match(until, {
          onNone: () => null,
          onSome: (date) => (
            <Text className="text-xs text-text-muted dark:text-slate-400">
              {t('detail.invite.pendingUntil', { date })}
            </Text>
          ),
        })}
      </View>
      {canWithdraw && (
        <Pressable
          onPress={confirmWithdraw}
          disabled={withdraw.isPending}
          hitSlop={8}
          testID={`canopy-withdraw-${invitation.id}`}
        >
          <Text className="text-sm font-medium text-coral">
            {t('detail.invite.withdraw')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
