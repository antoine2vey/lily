import { MaterialIcons } from '@expo/vector-icons'
import type { CareTask } from '@lily/shared'
import { formatDayOfWeekShort, now, parseApiDate } from '@lily/shared'
import { Array, DateTime, Match, Option, pipe } from 'effect'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface WeeklyScheduleProps {
  overdue: ReadonlyArray<CareTask>
  today: ReadonlyArray<CareTask>
  upcoming: ReadonlyArray<CareTask>
}

interface DayColumn {
  dayIndex: number
  dayLabel: string
  dayNumber: number
  waterCount: number
  fertilizeCount: number
  isToday: boolean
}

const isSameDayUtc = (a: DateTime.DateTime, b: DateTime.DateTime): boolean => {
  const pa = DateTime.toParts(a)
  const pb = DateTime.toParts(b)
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day
}

const countByType = (
  tasks: ReadonlyArray<CareTask>,
  type: CareTask['type']
): number =>
  pipe(
    tasks,
    Array.filter((t) => t.type === type),
    Array.length
  )

function buildWeekColumns(
  overdue: ReadonlyArray<CareTask>,
  today: ReadonlyArray<CareTask>,
  upcoming: ReadonlyArray<CareTask>,
  todayLabel: string
): ReadonlyArray<DayColumn> {
  const base = now()

  return Array.makeBy(7, (i) => {
    const dayDt = DateTime.add(base, { days: i })
    const parts = DateTime.toParts(dayDt)

    const tasksForDay =
      i === 0
        ? Array.appendAll(overdue, today)
        : pipe(
            upcoming,
            Array.filter((task) =>
              pipe(
                parseApiDate(task.dueDate),
                Option.map((dt) => isSameDayUtc(dt, dayDt)),
                Option.getOrElse(() => false)
              )
            )
          )

    return {
      dayIndex: i,
      dayLabel: i === 0 ? todayLabel : formatDayOfWeekShort(dayDt),
      dayNumber: parts.day,
      waterCount: countByType(tasksForDay, 'water'),
      fertilizeCount: countByType(tasksForDay, 'fertilize'),
      isToday: i === 0,
    }
  })
}

interface DayDotProps {
  count: number
  color: string
}

function DayDots({ count, color }: DayDotProps) {
  const dots = Array.makeBy(Math.min(count, 3), (i) => i)
  return (
    <View className="flex-row gap-0.5 justify-center">
      {Array.map(dots, (i) => (
        <View
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </View>
  )
}

export function WeeklySchedule({
  overdue,
  today,
  upcoming,
}: WeeklyScheduleProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  const columns = useMemo(
    () => buildWeekColumns(overdue, today, upcoming, t('weeklySchedule.today')),
    [overdue, today, upcoming, t]
  )
  const hasAnyTasks = Array.some(
    columns,
    (c) => c.waterCount > 0 || c.fertilizeCount > 0
  )

  if (!hasAnyTasks) return null

  return (
    <View className="mb-8">
      <View className="flex-row items-center gap-2 mb-3 px-1">
        <MaterialIcons
          name="calendar-today"
          size={16}
          color={iconColors.textSecondary}
        />
        <Text className="text-base font-bold text-text-primary dark:text-white tracking-tight">
          {t('weeklySchedule.title')}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      >
        {pipe(
          columns,
          Array.map((col) => {
            const isActive = col.waterCount > 0 || col.fertilizeCount > 0
            const bgColor = pipe(
              Match.value(col),
              Match.when({ isToday: true }, () =>
                isDark ? 'rgba(155, 199, 109, 0.2)' : 'rgba(91, 140, 90, 0.12)'
              ),
              Match.orElse(() =>
                isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
              )
            )

            return (
              <View
                key={col.dayIndex}
                className="items-center py-3 rounded-2xl"
                style={{
                  width: 48,
                  backgroundColor: bgColor,
                  borderWidth: col.isToday ? 1.5 : 0,
                  borderColor: col.isToday ? iconColors.primary : 'transparent',
                }}
              >
                {/* Day abbrev */}
                <Text
                  className="text-[10px] font-bold uppercase tracking-wide mb-1"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  style={{
                    color: col.isToday
                      ? iconColors.primary
                      : iconColors.textMuted,
                  }}
                >
                  {col.dayLabel}
                </Text>
                {/* Day number */}
                <Text
                  className="text-base font-bold mb-2"
                  style={{
                    color: col.isToday
                      ? iconColors.primary
                      : iconColors.textPrimary,
                  }}
                >
                  {col.dayNumber}
                </Text>
                {/* Dots */}
                <View className="gap-1 min-h-[16px]">
                  {col.waterCount > 0 && (
                    <DayDots
                      count={col.waterCount}
                      color={iconColors.waterBlue}
                    />
                  )}
                  {col.fertilizeCount > 0 && (
                    <DayDots
                      count={col.fertilizeCount}
                      color={iconColors.warning}
                    />
                  )}
                  {!isActive && (
                    <View
                      className="w-1.5 h-1.5 rounded-full self-center opacity-30"
                      style={{
                        backgroundColor: isDark ? '#9CA3AF' : '#CBD5E1',
                      }}
                    />
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}
