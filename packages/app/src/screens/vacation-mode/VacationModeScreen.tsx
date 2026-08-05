import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, parseApiDate } from '@lily/shared'
import { toDateId } from '@marceloterreiro/flash-calendar'
import { DateTime, Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { GlassBackButton } from '@/components/GlassBackButton'
import { SkeletonBox } from '@/components/skeletons'
import { Button } from '@/components/ui/Button'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import {
  useCancelVacation,
  useSetVacation,
  useVacation,
} from '@/hooks/useVacation'
import { VacationDatePicker } from '@/screens/vacation-mode/components/VacationDatePicker'
import { VacationModeSkeleton } from '@/screens/vacation-mode/components/VacationModeSkeleton'

const formatDisplayDate = (date: Date | null): string =>
  pipe(
    Option.fromNullable(date),
    Option.flatMap((d) => parseApiDate(d)),
    Option.map((dt) => formatShortDate(dt)),
    Option.getOrElse(() => '')
  )

const dateIdToUtcDate = (dateId: string): Date =>
  DateTime.toDateUtc(DateTime.unsafeMake(`${dateId}T00:00:00.000Z`))

export function VacationModeScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation(['vacation', 'common'])
  const iconColors = useIconColors()

  const { data, isLoading, error, refetch: _refetch } = useVacation()
  const refetch = _refetch as () => void
  const { mutate: setVacation, isPending: isSaving } = useSetVacation()
  const { mutate: cancelVacation, isPending: isCanceling } = useCancelVacation()

  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const status = data?.status ?? 'none'
  const isActive = status === 'active'

  // Seed the pickers from the server state whenever it changes
  useEffect(() => {
    setStartDate(
      pipe(
        Option.fromNullable(data?.startDate),
        Option.map(toDateId),
        Option.getOrNull
      )
    )
    setEndDate(
      pipe(
        Option.fromNullable(data?.endDate),
        Option.map(toDateId),
        Option.getOrNull
      )
    )
    setFormError(null)
  }, [data?.startDate, data?.endDate])

  const handleSubmit = () => {
    if (!endDate) return
    setFormError(null)

    // Active vacations keep their stored start verbatim — the server
    // rejects any change to it. Otherwise send the picked calendar day.
    const start = pipe(
      Option.fromNullable(isActive ? data?.startDate : null),
      Option.orElse(() =>
        pipe(Option.fromNullable(startDate), Option.map(dateIdToUtcDate))
      ),
      Option.getOrNull
    )
    if (start === null) return

    setVacation(
      { payload: { startDate: start, endDate: dateIdToUtcDate(endDate) } },
      {
        onSuccess: () => {
          toast.success(
            status === 'none'
              ? t('vacation:toast.scheduled')
              : t('vacation:toast.updated')
          )
        },
        onError: (err: unknown) => {
          const tagged = err as { _tag?: string; message?: string }
          setFormError(
            pipe(
              Option.fromNullable(tagged.message),
              Option.getOrElse(() => t('vacation:errors.generic'))
            )
          )
        },
      }
    )
  }

  const handleCancel = () => {
    const isEnding = isActive
    Alert.alert(
      isEnding
        ? t('vacation:active.endConfirmTitle')
        : t('vacation:scheduled.cancelConfirmTitle'),
      isEnding
        ? t('vacation:active.endConfirmMessage')
        : t('vacation:scheduled.cancelConfirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: isEnding
            ? t('vacation:active.endNow')
            : t('vacation:scheduled.cancel'),
          style: 'destructive',
          onPress: () =>
            cancelVacation(
              {},
              {
                onSuccess: () => {
                  toast.success(
                    isEnding
                      ? t('vacation:toast.ended')
                      : t('vacation:toast.canceled')
                  )
                },
                onError: () => {
                  toast.error(t('vacation:errors.generic'))
                },
              }
            ),
        },
      ]
    )
  }

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  if (error) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark items-center justify-center p-6"
        style={{ paddingTop: insets.top }}
      >
        <MaterialIcons
          name="error-outline"
          size={48}
          color={iconColors.coral}
        />
        <Text className="text-lg text-center mt-4 font-semibold text-text-primary dark:text-white">
          {t('vacation:errors.generic')}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-6 px-6 py-3 rounded-full bg-primary"
        >
          <Text className="font-semibold text-white">
            {t('common:buttons.retry', { defaultValue: 'Try Again' })}
          </Text>
        </Pressable>
      </View>
    )
  }

  if (showSkeleton) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
          <View className="w-10 h-10" />
          <View className="flex-1 items-center mr-10">
            <SkeletonBox width={140} height={20} rounded="sm" />
          </View>
        </View>
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <VacationModeSkeleton />
          </ScrollView>
        </Animated.View>
      </View>
    )
  }

  if (isInitialLoading || !data) {
    return null
  }

  const statusCard = Match.value(status).pipe(
    Match.when('none', () => null),
    Match.when('scheduled', () => (
      <View className="rounded-2xl p-4 bg-primary-tint dark:bg-primary/20 border border-primary/30">
        <View className="flex-row items-center">
          <MaterialIcons name="event" size={20} color={iconColors.primary} />
          <Text className="ml-2 text-base font-semibold text-text-primary dark:text-white">
            {t('vacation:scheduled.title')}
          </Text>
        </View>
        <Text className="mt-1 text-sm font-regular text-text-secondary dark:text-slate-300">
          {t('vacation:scheduled.description', {
            start: formatDisplayDate(data.startDate),
            end: formatDisplayDate(data.endDate),
          })}
        </Text>
      </View>
    )),
    Match.when('active', () => (
      <View className="rounded-2xl p-4 bg-primary-tint dark:bg-primary/20 border border-primary/30">
        <View className="flex-row items-center">
          <MaterialIcons
            name="beach-access"
            size={20}
            color={iconColors.primary}
          />
          <Text className="ml-2 text-base font-semibold text-text-primary dark:text-white">
            {t('vacation:active.title')}
          </Text>
        </View>
        <Text className="mt-1 text-sm font-regular text-text-secondary dark:text-slate-300">
          {t('vacation:active.description', {
            end: formatDisplayDate(data.endDate),
          })}
        </Text>
        <Text className="mt-2 text-xs font-medium text-text-muted dark:text-slate-400">
          {t('vacation:active.startLocked', {
            start: formatDisplayDate(data.startDate),
          })}
        </Text>
      </View>
    )),
    Match.exhaustive
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
        <GlassBackButton />
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary dark:text-white">
          {t('vacation:title')}
        </Text>
      </View>

      <Animated.View entering={FadeIn.duration(300)} className="flex-1">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View className="px-6 py-4 gap-4">
            {status === 'none' && (
              <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
                {t('vacation:intro')}
              </Text>
            )}

            {statusCard}

            <VacationDatePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              endOnly={isActive}
              error={formError ?? undefined}
            />

            <Button
              onPress={handleSubmit}
              loading={isSaving}
              disabled={!endDate || (!isActive && !startDate)}
              icon="beach-access"
            >
              {status === 'none'
                ? t('vacation:schedule')
                : t('vacation:update')}
            </Button>

            {status !== 'none' && (
              <Button
                variant="destructive"
                onPress={handleCancel}
                loading={isCanceling}
              >
                {isActive
                  ? t('vacation:active.endNow')
                  : t('vacation:scheduled.cancel')}
              </Button>
            )}

            {/* Delegation suggestion */}
            <Pressable
              onPress={() => router.push('/delegation-create')}
              className="rounded-2xl p-4 bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 active:bg-surface-tinted dark:active:bg-slate-700"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
                  <MaterialIcons
                    name="volunteer-activism"
                    size={20}
                    color={iconColors.primary}
                  />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-base font-semibold text-text-primary dark:text-white">
                    {t('vacation:delegation.title')}
                  </Text>
                  <Text className="mt-0.5 text-xs font-regular text-text-muted dark:text-slate-400">
                    {t('vacation:delegation.description')}
                  </Text>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={iconColors.muted}
                />
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  )
}
