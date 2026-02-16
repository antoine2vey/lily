import type { CalendarTheme } from '@marceloterreiro/flash-calendar'
import { useMemo } from 'react'
import { useIconColors } from 'src/hooks/useIconColors'
import { fonts } from 'src/theme'

export function useCalendarTheme(): CalendarTheme {
  const { isDark, primary, textPrimary, textMuted } = useIconColors()

  return useMemo(
    (): CalendarTheme => ({
      rowMonth: {
        content: {
          fontFamily: fonts.bold,
          color: textPrimary,
          fontSize: 16,
        },
      },
      rowWeek: {
        container: {
          borderBottomWidth: 1,
          borderBottomColor: isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
          borderStyle: 'solid',
        },
      },
      itemWeekName: {
        content: {
          fontFamily: fonts.medium,
          color: textMuted,
          fontSize: 12,
        },
      },
      itemDayContainer: {
        activeDayFiller: {
          backgroundColor: isDark
            ? 'rgba(155,199,109,0.15)'
            : 'rgba(128,172,83,0.12)',
        },
      },
      itemDay: {
        idle: () => ({
          container: {
            backgroundColor: 'transparent',
            borderRadius: 8,
          },
          content: {
            fontFamily: fonts.medium,
            color: textPrimary,
          },
        }),
        today: () => ({
          container: {
            borderColor: primary,
            borderWidth: 1.5,
            borderRadius: 8,
            backgroundColor: 'transparent',
          },
          content: {
            fontFamily: fonts.semiBold,
            color: primary,
          },
        }),
        active: ({ isEndOfRange, isStartOfRange }) => ({
          container: {
            backgroundColor: primary,
            borderTopLeftRadius: isStartOfRange ? 8 : 0,
            borderBottomLeftRadius: isStartOfRange ? 8 : 0,
            borderTopRightRadius: isEndOfRange ? 8 : 0,
            borderBottomRightRadius: isEndOfRange ? 8 : 0,
          },
          content: {
            fontFamily: fonts.semiBold,
            color: '#FFFFFF',
          },
        }),
      },
    }),
    [isDark, primary, textPrimary, textMuted]
  )
}
