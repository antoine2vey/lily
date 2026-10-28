import type { CanopyInvitePreview } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Effect, Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MascotAnimation } from '@/assets/mascot'
import { GlassCard, MascotHero, MeshBackground } from '@/components'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useCanopyInvite } from '@/hooks/useCanopyInvite'
import {
  useAcceptCanopyInvite,
  useLeaveCanopy,
} from '@/hooks/useCanopyMutations'
import { useMyCanopy } from '@/hooks/useMyCanopy'
import { BringPlantsScreen } from '@/screens/canopy-join/BringPlantsScreen'
import { type JoinAttempt, joinScreen } from '@/screens/canopy-join/join-state'
import {
  clearPendingJoin,
  type InviteToken,
  parseInviteToken,
  stashPendingJoin,
} from '@/utils/canopy-invite-token'
import type { ApiFailure } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

interface CanopyJoinScreenProps {
  rawToken: string | undefined
}

/**
 * The route for `lily://join/<token>` and `https://withlily.app/join/<token>`.
 * A signed-out visitor only stashes the token: AuthContext sends them to sign
 * in, and the index route brings them back here afterwards.
 */
export function CanopyJoinScreen({ rawToken }: CanopyJoinScreenProps) {
  const { state } = useAuth()
  const token = parseInviteToken(rawToken)

  return pipe(
    Match.value(state),
    Match.tag('Authenticated', () => <JoinFlow token={token} />),
    Match.tag('Loading', () => <BlankMesh />),
    Match.orElse(() => <StashForLater token={token} />)
  )
}

function StashForLater({ token }: { token: Option.Option<InviteToken> }) {
  useEffect(() => {
    if (Option.isSome(token)) {
      Effect.runFork(stashPendingJoin(token.value))
    }
  }, [token])

  return <BlankMesh />
}

function BlankMesh() {
  return (
    <MeshBackground>
      <View className="flex-1" />
    </MeshBackground>
  )
}

interface Hero {
  animation: MascotAnimation
  title: string
  subtitle?: string
}

function JoinFlow({ token }: { token: Option.Option<InviteToken> }) {
  const { t } = useTranslation('canopy')
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const preview = useCanopyInvite(token)
  const mine = useMyCanopy()
  const accept = useAcceptCanopyInvite()
  const leave = useLeaveCanopy()
  const [attempt, setAttempt] = useState<JoinAttempt>({ _tag: 'Idle' })

  useEffect(() => {
    Effect.runFork(clearPendingJoin)
  }, [])

  const screen = joinScreen({
    token,
    preview: preview.result,
    mine: mine.result,
    attempt,
  })

  const refuse = (error: ApiFailure) => {
    if (error._tag === 'AlreadyInCanopyError') {
      queryClient.invalidateQueries({ queryKey: queryKeys.canopy.all })
    }
    setAttempt({ _tag: 'Refused', error })
  }

  const join = (validToken: InviteToken) =>
    accept
      .mutateAsync(validToken)
      .then((canopy) => setAttempt({ _tag: 'Joined', canopyName: canopy.name }))
      .catch(refuse)

  const onJoin = () =>
    Option.map(token, (validToken) => {
      setAttempt({ _tag: 'Working' })
      join(validToken)
    })

  const onOpenCurrent = () =>
    Option.map(token, (validToken) => {
      setAttempt({ _tag: 'Working' })
      accept
        .mutateAsync(validToken)
        .then(() => router.replace('/canopy'))
        .catch(refuse)
    })

  const onLeaveAndJoin = (current: string, target: string) =>
    Option.map(token, (validToken) =>
      Alert.alert(
        t('join.another.confirmTitle', { current }),
        t('join.another.confirmMessage', { current, name: target }),
        [
          { text: t('join.notNow'), style: 'cancel' },
          {
            text: t('join.another.leave', { current }),
            style: 'destructive',
            onPress: () => {
              setAttempt({ _tag: 'Working' })
              leave
                .mutateAsync()
                .then(() => join(validToken))
                .catch(refuse)
            },
          },
        ]
      )
    )

  const close = () => router.replace('/(app)/(tabs)')

  if (screen._tag === 'PickPlants') {
    return <BringPlantsScreen canopyName={screen.canopyName} />
  }

  const invitedLine = (p: CanopyInvitePreview) =>
    [
      p.inviterName
        ? t('join.invitedBy', { name: p.inviterName })
        : t('join.invited'),
      t('join.members', { count: p.memberCount }),
    ].join(' · ')

  const hero = pipe(
    Match.value(screen),
    Match.tag('Loading', (): Hero => ({ animation: 'lookAround', title: '' })),
    Match.tag(
      'Invalid',
      (): Hero => ({
        animation: 'rainy',
        title: t('join.invalid.title'),
        subtitle: t('join.invalid.description'),
      })
    ),
    Match.tag(
      'Expired',
      (): Hero => ({
        animation: 'rainy',
        title: t('join.expired.title'),
        subtitle: t('join.expired.description'),
      })
    ),
    Match.tag(
      'Unavailable',
      (): Hero => ({
        animation: 'rainy',
        title: t('join.unavailable.title'),
        subtitle: t('join.unavailable.description'),
      })
    ),
    Match.tag(
      'Ready',
      ({ preview: p }): Hero => ({
        animation: 'hello',
        title: t('join.title', { name: p.canopyName }),
        subtitle: invitedLine(p),
      })
    ),
    Match.tag(
      'AlreadyHere',
      ({ preview: p }): Hero => ({
        animation: 'celebrate',
        title: t('join.alreadyHere.title', { name: p.canopyName }),
      })
    ),
    Match.tag(
      'InAnotherCanopy',
      ({ preview: p, currentName }): Hero => ({
        animation: 'lookAround',
        title: t('join.another.title', { current: currentName }),
        subtitle: t('join.another.description', {
          current: currentName,
          name: p.canopyName,
        }),
      })
    ),
    Match.tag(
      'Full',
      ({ preview: p, limit }): Hero => ({
        animation: 'rainy',
        title: t('join.full.title', { name: p.canopyName }),
        subtitle: t('join.full.description', { max: limit }),
      })
    ),
    Match.exhaustive
  )

  const actions = pipe(
    Match.value(screen),
    Match.tag('Loading', () => null),
    Match.tag('Invalid', () => <CloseButton onPress={close} />),
    Match.tag('Expired', () => <CloseButton onPress={close} />),
    Match.tag('Full', () => <CloseButton onPress={close} />),
    Match.tag('Unavailable', () => (
      <>
        <Button pill onPress={() => preview.refetch()}>
          {t('join.unavailable.retry')}
        </Button>
        <CloseButton onPress={close} />
      </>
    )),
    Match.tag('Ready', ({ busy, failed }) => (
      <>
        <Text
          className="text-sm text-white/75 text-center"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {failed ? t('join.failed') : t('join.note')}
        </Text>
        <Button
          pill
          loading={busy}
          disabled={busy}
          onPress={onJoin}
          testID="canopy-join-button"
        >
          {t('join.join')}
        </Button>
        <CloseButton onPress={close} />
      </>
    )),
    Match.tag('AlreadyHere', ({ busy }) => (
      <>
        <Button
          pill
          loading={busy}
          disabled={busy}
          onPress={onOpenCurrent}
          testID="canopy-open-button"
        >
          {t('join.alreadyHere.open')}
        </Button>
        <CloseButton onPress={close} />
      </>
    )),
    Match.tag('InAnotherCanopy', ({ preview: p, currentName, busy }) => (
      <>
        <Button
          pill
          variant="destructive"
          loading={busy}
          disabled={busy}
          onPress={() => onLeaveAndJoin(currentName, p.canopyName)}
          testID="canopy-leave-and-join-button"
        >
          {t('join.another.leave', { current: currentName })}
        </Button>
        <CloseButton onPress={close} />
      </>
    )),
    Match.exhaustive
  )

  return (
    <MeshBackground>
      <View
        className="flex-1"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <View className="flex-1">
          {screen._tag !== 'Loading' && (
            <MascotHero
              animation={hero.animation}
              title={hero.title}
              {...(hero.subtitle ? { subtitle: hero.subtitle } : {})}
            />
          )}
        </View>
        {actions && <GlassCard>{actions}</GlassCard>}
      </View>
    </MeshBackground>
  )
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('canopy')
  return (
    <Button pill variant="glass" onPress={onPress}>
      {t('join.notNow')}
    </Button>
  )
}
