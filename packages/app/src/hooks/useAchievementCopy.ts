import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface AchievementText {
  key: string
  name: string
  description: string
}

/**
 * The achievement's name and description in the app's language. The server
 * only sends English, which stays the fallback for a key added server-side
 * before the app's catalog knows it.
 */
export function useAchievementCopy() {
  const { t } = useTranslation('achievements')

  return useCallback(
    (achievement: AchievementText) => ({
      name: t(`catalog.${achievement.key}.name`, {
        defaultValue: achievement.name,
      }),
      description: t(`catalog.${achievement.key}.description`, {
        defaultValue: achievement.description,
      }),
    }),
    [t]
  )
}
