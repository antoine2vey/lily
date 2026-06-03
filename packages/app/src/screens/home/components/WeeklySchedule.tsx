import { MaterialIcons } from '@expo/vector-icons'
import type { CareTask } from '@lily/shared'
import { formatPlainDateWeekdayShort, plainDateDayOfMonth } from '@lily/shared'
import { Array, Match, pipe } from 'effect'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface WeeklyScheduleProps {
  overdue: ReadonlyArray<CareTask>
  today: ReadonlyArray<CareTask>
  upcoming: ReadonlyArray<CareTask>
  // Authoritative day axis from the API (index 0 = today), each entry a
  // YYYY-MM-DD local date. The calendar renders one column per entry.
  windowDays: ReadonlyArray<string>
}

interface DayColumn {
  dayIndex: number
  dayLabel: string
  dayNumber: number
  waterCount: number
  fertilizeCount: number
  mistingCount: number
  repottingCount: number
  overdueCount: number
  isToday: boolean
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

// Build one column per backend window day. Each task already carries its
// server-computed `dueDayOffset` (0 = today, +N = N days ahead, in the user's
// timezone), so a column just collects tasks whose offset matches its index —
// no client-side date math, no timezone frame to drift out of sync.
function buildWeekColumns(
  today: ReadonlyArray<CareTask>,
  upcoming: ReadonlyArray<CareTask>,
  windowDays: ReadonlyArray<string>,
  overdueCount: number,
  todayLabel: string,
  locale: string
): ReadonlyArray<DayColumn> {
  return Array.map(windowDays, (localDate, i) => {
    // Column 0 is "today" and counts only tasks genuinely due today; overdue
    // tasks are surfaced as a distinct badge rather than inflating today's dots.
    const tasksForDay =
      i === 0 ? today : Array.filter(upcoming, (t) => t.dueDayOffset === i)

    return {
      dayIndex: i,
      dayLabel:
        i === 0 ? todayLabel : formatPlainDateWeekdayShort(localDate, locale),
      dayNumber: plainDateDayOfMonth(localDate),
      waterCount: countByType(tasksForDay, 'watering'),
      fertilizeCount: countByType(tasksForDay, 'fertilization'),
      mistingCount: countByType(tasksForDay, 'misting'),
      repottingCount: countByType(tasksForDay, 'repotting'),
      overdueCount: i === 0 ? overdueCount : 0,
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
    <View className="flex-row gap-0.5 justify-center items-center">
      {Array.map(dots, (i) => (
        <View
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
      {/* Counts above 3 would otherwise alias to exactly 3 dots — show the
          overflow so the calendar doesn't undercount vs the care screen. */}
      {count > 3 && (
        <Text
          className="text-[8px] font-bold ml-0.5"
          style={{ color }}
        >{`+${count - 3}`}</Text>
      )}
    </View>
  )
}

export function WeeklySchedule({
  overdue,
  today,
  upcoming,
  windowDays,
}: WeeklyScheduleProps) {
  const { t, i18n } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  const columns = useMemo(
    () =>
      buildWeekColumns(
        today,
        upcoming,
        windowDays,
        Array.length(overdue),
        t('weeklySchedule.today'),
        i18n.language
      ),
    [today, upcoming, windowDays, overdue, t, i18n.language]
  )
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
            const isActive =
              col.waterCount > 0 ||
              col.fertilizeCount > 0 ||
              col.mistingCount > 0 ||
              col.repottingCount > 0 ||
              col.overdueCount > 0
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
                  {/* Overdue indicator — kept distinct from today's dots so the
                      today column mirrors the care screen's separate Overdue
                      section instead of conflating the two. */}
                  {col.overdueCount > 0 && (
                    <View
                      className="px-1.5 rounded-full self-center"
                      style={{ backgroundColor: iconColors.coral }}
                    >
                      <Text className="text-[9px] font-bold text-white">
                        {col.overdueCount}
                      </Text>
                    </View>
                  )}
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
                  {col.mistingCount > 0 && (
                    <DayDots
                      count={col.mistingCount}
                      color={iconColors.mistTeal}
                    />
                  )}
                  {col.repottingCount > 0 && (
                    <DayDots
                      count={col.repottingCount}
                      color={iconColors.repotBrown}
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
