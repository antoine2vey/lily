import { MaterialIcons } from '@expo/vector-icons'
import type { Canopy, CanopyResponse } from '@lily/shared'
import { Array as Arr, Match, Option, pipe, Result } from 'effect'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Alert, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { SkeletonBox } from '@/components/skeletons'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useDeleteCanopy, useLeaveCanopy } from '@/hooks/useCanopyMutations'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useMyCanopy } from '@/hooks/useMyCanopy'
import { CanopyInviteCard } from '@/screens/canopy/components/CanopyInviteCard'
import { CanopyMembersCard } from '@/screens/canopy/components/CanopyMembersCard'
import { CanopyNameCard } from '@/screens/canopy/components/CanopyNameCard'
import { CanopyPlaceCard } from '@/screens/canopy/components/CanopyPlaceCard'
import type { ApiResult } from '@/utils/client'

type CanopyView =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Failed' }
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Member'; readonly canopy: Canopy }

const canopyView = (
  result: ApiResult<CanopyResponse> | undefined
): CanopyView =>
  result === undefined
    ? { _tag: 'Loading' }
    : Result.match(result, {
        onFailure: (): CanopyView => ({ _tag: 'Failed' }),
        onSuccess: ({ canopy }): CanopyView =>
          canopy === null ? { _tag: 'None' } : { _tag: 'Member', canopy },
      })

export function CanopyScreen() {
  const { t } = useTranslation('canopy')
  const insets = useSafeAreaInsets()
  const query = useMyCanopy()
  const view = canopyView(query.result)
  const showSkeleton = useDelayedLoading(view._tag === 'Loading')

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center px-4 py-3">
        <GlassBackButton />
        <Text
          className="flex-1 text-lg text-center mr-10 text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          {t('title')}
        </Text>
      </View>

      {pipe(
        Match.value(view),
        Match.tag('Loading', () =>
          showSkeleton ? (
            <Animated.View entering={FadeIn.duration(300)}>
              <CanopySkeleton />
            </Animated.View>
          ) : null
        ),
        Match.tag('Failed', () => (
          <CanopyFailed onRetry={() => query.refetch()} />
        )),
        Match.tag('None', () => <CanopyNone />),
        Match.tag('Member', ({ canopy }) => (
          <Animated.View entering={FadeIn.duration(300)} className="flex-1">
            <CanopyDetail canopy={canopy} />
          </Animated.View>
        )),
        Match.exhaustive
      )}
    </View>
  )
}

function CanopyNone() {
  const { t } = useTranslation('canopy')
  const insets = useSafeAreaInsets()
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 px-6"
      style={{ paddingBottom: insets.bottom + 16 }}
      testID="canopy-empty"
    >
      <EmptyState
        kind="canopyNone"
        action={{
          label: t('none.create'),
          onPress: () => router.push('/canopy-create'),
        }}
      />
      <Text className="text-sm text-center text-text-muted dark:text-slate-400">
        {t('none.joinHint')}
      </Text>
    </Animated.View>
  )
}

function CanopyFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('canopy')
  const iconColors = useIconColors()
  return (
    <View className="flex-1 items-center justify-center p-6 gap-4">
      <MaterialIcons name="error-outline" size={48} color={iconColors.coral} />
      <Text className="text-base text-center text-text-primary dark:text-white">
        {t('detail.failed')}
      </Text>
      <Button variant="secondary" onPress={onRetry}>
        {t('join.unavailable.retry')}
      </Button>
    </View>
  )
}

function CanopyDetail({ canopy }: { canopy: Canopy }) {
  const { t } = useTranslation('canopy')
  const insets = useSafeAreaInsets()
  const { state } = useAuth()
  const leave = useLeaveCanopy()
  const remove = useDeleteCanopy()
  const myUserId = state._tag === 'Authenticated' ? state.user.id : ''
  const isOwner = canopy.role === 'owner'

  const leaveMessage = () => {
    const others = Arr.filter(canopy.members, (m) => m.userId !== myUserId)
    return pipe(
      Arr.head(others),
      Option.match({
        onNone: () => t('detail.leaveMessageLast'),
        onSome: (heir) =>
          isOwner
            ? t('detail.leaveMessageOwner', {
                heir: pipe(
                  Option.fromNullishOr(heir.name),
                  Option.getOrElse(() => t('detail.unnamed'))
                ),
              })
            : t('detail.leaveMessageMember'),
      })
    )
  }

  const confirmLeave = () =>
    Alert.alert(t('detail.leaveTitle', { name: canopy.name }), leaveMessage(), [
      { text: t('join.notNow'), style: 'cancel' },
      {
        text: t('detail.leave'),
        style: 'destructive',
        onPress: () =>
          leave.mutate(undefined, {
            onSuccess: () => toast.success(t('detail.left')),
            onError: () => toast.error(t('detail.failed')),
          }),
      },
    ])

  const confirmDelete = () =>
    Alert.alert(
      t('detail.deleteTitle', { name: canopy.name }),
      t('detail.deleteMessage'),
      [
        { text: t('join.notNow'), style: 'cancel' },
        {
          text: t('detail.delete'),
          style: 'destructive',
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: () => toast.success(t('detail.deleted')),
              onError: () => toast.error(t('detail.failed')),
            }),
        },
      ]
    )

  return (
    <ScrollView
      className="flex-1 px-4"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: 16,
        paddingBottom: insets.bottom + 24,
      }}
      testID="canopy-detail"
    >
      <CanopyNameCard key={canopy.name} name={canopy.name} />
      <CanopyMembersCard canopy={canopy} myUserId={myUserId} />
      <CanopyInviteCard canopy={canopy} />
      <CanopyPlaceCard canopy={canopy} />
      <View className="gap-3">
        <Button
          variant="secondary"
          onPress={confirmLeave}
          loading={leave.isPending}
          disabled={leave.isPending}
          testID="canopy-leave"
        >
          {t('detail.leave')}
        </Button>
        {isOwner && (
          <Button
            variant="destructive"
            onPress={confirmDelete}
            loading={remove.isPending}
            disabled={remove.isPending}
            testID="canopy-delete"
          >
            {t('detail.delete')}
          </Button>
        )}
      </View>
    </ScrollView>
  )
}

function CanopySkeleton() {
  return (
    <View className="px-4 pt-4 gap-6">
      <SkeletonBox width="100%" height={56} rounded="lg" />
      <View className="gap-2">
        <SkeletonBox width={90} height={12} rounded="sm" />
        <SkeletonBox width="100%" height={132} rounded="lg" />
      </View>
      <View className="gap-2">
        <SkeletonBox width={110} height={12} rounded="sm" />
        <SkeletonBox width="100%" height={120} rounded="lg" />
      </View>
    </View>
  )
}
