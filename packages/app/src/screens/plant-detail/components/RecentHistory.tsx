import { type DateInput, getRelativeTime, parseApiDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import type { i18n as I18n, TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { SectionHeader } from '@/components/SectionHeader'
import { useIconColors } from '@/hooks/useIconColors'

type EventType = 'watered' | 'fertilized' | 'misted' | 'pruned' | 'repotted'

interface HistoryEvent {
  id: string
  type: EventType
  date: DateInput
  notes?: string
}

interface RecentHistoryProps {
  events: ReadonlyArray<HistoryEvent>
  onViewAll: () => void
}

interface EventConfig {
  color: string
  label: string
}

const getEventConfig = (
  type: EventType,
  iconColors: ReturnType<typeof useIconColors>,
  t: TFunction
): EventConfig =>
  pipe(
    Match.value(type),
    Match.when('watered', () => ({
      color: iconColors.waterBlue,
      label: t('detail.events.watered'),
    })),
    Match.when('fertilized', () => ({
      color: iconColors.fertilizerOrange,
      label: t('detail.events.fertilized'),
    })),
    Match.when('misted', () => ({
      color: iconColors.mistTeal,
      label: t('detail.events.misted'),
    })),
    Match.when('pruned', () => ({
      color: iconColors.pruneRed,
      label: t('detail.events.pruned'),
    })),
    Match.when('repotted', () => ({
      color: '#9C27B0',
      label: t('detail.events.repotted'),
    })),
    Match.exhaustive
  )

const formatRelativeTimeResult = (
  result: ReturnType<typeof getRelativeTime>,
  i18n: I18n
): string =>
  pipe(
    Match.value(result),
    Match.when({ _tag: 'now' }, () => i18n.t('time.justNow', { ns: 'common' })),
    Match.when({ _tag: 'minutes' }, ({ value }) =>
      i18n.t('time.minutesAgo', { ns: 'common', count: value })
    ),
    Match.when({ _tag: 'hours' }, ({ value }) =>
      i18n.t('time.hoursAgo', { ns: 'common', count: value })
    ),
    Match.when({ _tag: 'days' }, ({ value }) =>
      value === 1
        ? i18n.t('time.yesterday', { ns: 'common' })
        : i18n.t('time.daysAgo', { ns: 'common', count: value })
    ),
    Match.when({ _tag: 'date' }, ({ formatted }) => formatted),
    Match.exhaustive
  )

const formatRelativeDate = (
  date: DateInput,
  t: TFunction,
  i18n: I18n
): string =>
  pipe(
    parseApiDate(date),
    Option.map((dt) =>
      formatRelativeTimeResult(getRelativeTime(dt, i18n.language), i18n)
    ),
    Option.getOrElse(() => t('detail.events.unknownTime'))
  )

export function RecentHistory({ events, onViewAll }: RecentHistoryProps) {
  const { t, i18n } = useTranslation('plants')
  const iconColors = useIconColors()
  const recentEvents = Array.take(events, 3)

  return (
    <View testID="recent-history">
      <SectionHeader
        title={t('detail.recentHistory')}
        action={{ label: t('detail.viewAll'), onPress: onViewAll }}
      />
      <View className="mt-4">
        {Array.length(recentEvents) === 0 ? (
          <Text
            className="text-sm py-4 text-center font-regular text-text-muted dark:text-slate-400"
            testID="no-history"
          >
            {t('detail.noCareHistory')}
          </Text>
        ) : (
          Array.map(recentEvents, (event) => {
            const config = getEventConfig(event.type, iconColors, t)
            return (
              <View
                key={event.id}
                className="flex-row items-center py-1.5"
                testID={`history-event-${event.id}`}
              >
                <View
                  className="w-2 h-2 rounded-full mr-3"
                  style={{ backgroundColor: config.color }}
                />
                <View className="flex-1">
                  <Text className="text-base font-medium text-text-primary dark:text-white">
                    {config.label}
                  </Text>
                  {event.notes && (
                    <Text
                      className="text-xs mt-0.5 font-regular text-text-muted dark:text-slate-400"
                      numberOfLines={1}
                    >
                      {event.notes}
                    </Text>
                  )}
                </View>
                <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
                  {formatRelativeDate(event.date, t, i18n)}
                </Text>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}
