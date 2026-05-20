import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, parseApiDate } from '@lily/shared'
import { Option, pipe } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { Avatar } from '@/components/Avatar'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useAuth } from '@/contexts/AuthContext'
import { useCancelDelegation } from '@/hooks/useCancelDelegation'
import { useCompleteDelegation } from '@/hooks/useCompleteDelegation'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useDelegation } from '@/hooks/useDelegation'
import { useIconColors } from '@/hooks/useIconColors'
import { useRespondDelegation } from '@/hooks/useRespondDelegation'
import { DelegationActions } from '@/screens/delegation-detail/components/DelegationActions'
import { DelegationDetailSkeleton } from '@/screens/delegation-detail/components/DelegationDetailSkeleton'
import { DelegationPlantList } from '@/screens/delegation-detail/components/DelegationPlantList'
import { DelegationStatusBadge } from '@/screens/delegation-detail/components/DelegationStatusBadge'

export function DelegationDetailScreen() {
  const { t } = useTranslation('delegations')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const { delegationId } = useLocalSearchParams<{ delegationId: string }>()
  const { state: authState } = useAuth()

  const { data: delegation, isLoading } = useDelegation(delegationId ?? '')

  const { mutate: respond, isPending: isResponding } = useRespondDelegation()
  const { mutate: cancel, isPending: isCanceling } = useCancelDelegation()
  const { mutate: complete, isPending: isCompleting } = useCompleteDelegation()

  const isInitialLoading = isLoading && !delegation
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const currentUserId =
    authState._tag === 'Authenticated' ? authState.user.id : ''

  const userRole = pipe(
    Option.fromNullable(delegation),
    Option.map((d) => (d.ownerId === currentUserId ? 'owner' : 'caretaker')),
    Option.getOrElse(() => 'owner' as const)
  )

  const handleAccept = () => {
    if (!delegationId) return
    respond(
      { path: { delegationId }, payload: { accept: true } },
      {
        onSuccess: () => toast.success(t('toast.accepted')),
        onError: () => toast.error(t('toast.acceptFailed')),
      }
    )
  }

  const handleReject = () => {
    if (!delegationId) return
    respond(
      { path: { delegationId }, payload: { accept: false } },
      {
        onSuccess: () => {
          toast.success(t('toast.declined'))
          router.back()
        },
        onError: () => toast.error(t('toast.declineFailed')),
      }
    )
  }

  const handleCancel = () => {
    if (!delegationId) return
    cancel(
      { path: { delegationId } },
      {
        onSuccess: () => {
          toast.success(t('toast.canceled'))
          router.back()
        },
        onError: () => toast.error(t('toast.cancelFailed')),
      }
    )
  }

  const handleComplete = () => {
    if (!delegationId) return
    complete(
      { path: { delegationId } },
      {
        onSuccess: () => toast.success(t('toast.completed')),
        onError: () => toast.error(t('toast.completeFailed')),
      }
    )
  }

  const handlePlantPress = (plantId: string) => {
    router.push(`/plant/${plantId}`)
  }

  const formatDate = (date: Date): string =>
    pipe(
      parseApiDate(date),
      Option.map(formatShortDate),
      Option.getOrElse(() => t('detail.unknownDate'))
    )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-4">
        <GlassBackButton />
        <Text
          className="flex-1 text-lg text-center font-bold text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          {t('detail.title')}
        </Text>
        <View className="w-10" />
      </View>

      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <DelegationDetailSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : delegation ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <ScrollView
            className="flex-1 px-6"
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-6 mt-2">
              {/* Status Badge */}
              <DelegationStatusBadge status={delegation.status} />

              {/* People */}
              <View className="gap-3">
                {/* Owner */}
                <View className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark">
                  <Avatar
                    source={pipe(
                      Option.fromNullable(delegation.ownerImage),
                      Option.map((uri) => ({ uri })),
                      Option.getOrUndefined
                    )}
                    name={pipe(
                      Option.fromNullable(delegation.ownerName),
                      Option.getOrElse(() => t('detail.plantOwner'))
                    )}
                    size="lg"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
                      {t('detail.plantOwner')}
                    </Text>
                    <Text
                      className="text-base font-semibold text-text-primary dark:text-white"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                    >
                      {pipe(
                        Option.fromNullable(delegation.ownerName),
                        Option.getOrElse(() => t('card.unknown'))
                      )}
                      {delegation.ownerId === currentUserId && (
                        <Text className="text-sm text-text-muted">
                          {' '}
                          {t('detail.you')}
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>

                {/* Arrow */}
                <View className="items-center">
                  <MaterialIcons
                    name="arrow-downward"
                    size={20}
                    color={iconColors.textMuted}
                  />
                </View>

                {/* Caretaker */}
                <View className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark">
                  <Avatar
                    source={pipe(
                      Option.fromNullable(delegation.caretakerImage),
                      Option.map((uri) => ({ uri })),
                      Option.getOrUndefined
                    )}
                    name={pipe(
                      Option.fromNullable(delegation.caretakerName),
                      Option.getOrElse(() => t('detail.caretaker'))
                    )}
                    size="lg"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
                      {t('detail.caretaker')}
                    </Text>
                    <Text
                      className="text-base font-semibold text-text-primary dark:text-white"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                    >
                      {pipe(
                        Option.fromNullable(delegation.caretakerName),
                        Option.getOrElse(() => t('card.unknown'))
                      )}
                      {delegation.caretakerId === currentUserId && (
                        <Text className="text-sm text-text-muted">
                          {' '}
                          {t('detail.you')}
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Date Range */}
              <View className="flex-row gap-3">
                <View className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark">
                  <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
                    {t('detail.startDate')}
                  </Text>
                  <Text
                    className="text-sm mt-1 font-semibold text-text-primary dark:text-white"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                  >
                    {formatDate(delegation.startDate)}
                  </Text>
                </View>
                <View className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark">
                  <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
                    {t('detail.endDate')}
                  </Text>
                  <Text
                    className="text-sm mt-1 font-semibold text-text-primary dark:text-white"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                  >
                    {formatDate(delegation.endDate)}
                  </Text>
                </View>
              </View>

              {/* Message */}
              {delegation.message && (
                <View className="p-4 rounded-xl bg-surface dark:bg-surface-dark">
                  <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
                    {t('detail.message')}
                  </Text>
                  <Text className="text-sm mt-1 text-text-primary dark:text-white leading-relaxed">
                    {delegation.message}
                  </Text>
                </View>
              )}

              {/* Plant List */}
              <DelegationPlantList
                plants={delegation.plants}
                onPlantPress={handlePlantPress}
              />

              {/* Actions */}
              <DelegationActions
                status={delegation.status}
                role={userRole}
                onAccept={handleAccept}
                onReject={handleReject}
                onCancel={handleCancel}
                onComplete={handleComplete}
                isAccepting={isResponding}
                isRejecting={isResponding}
                isCanceling={isCanceling}
                isCompleting={isCompleting}
              />
            </View>
          </ScrollView>
        </Animated.View>
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <MaterialIcons
            name="error-outline"
            size={48}
            color={iconColors.textMuted}
          />
          <Text className="text-base mt-4 text-text-muted dark:text-slate-400">
            {t('detail.notFound')}
          </Text>
        </View>
      )}
    </View>
  )
}
