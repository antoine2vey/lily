import type { AchievementWithProgress } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Option, pipe, String } from 'effect'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAchievements } from 'src/hooks/useAchievements'
import { ACCESS_TOKEN_KEY, API_BASE_URL } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

interface AchievementNotifications {
  currentAchievement: AchievementWithProgress | null
  dismiss: () => void
}

const MAX_RECONNECT_DELAY_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10
const SSE_DATA_PREFIX = 'data: '

function parseSSEDataLine(msg: string): Option.Option<string> {
  return pipe(
    String.split(msg, '\n'),
    Array.findFirst(String.startsWith(SSE_DATA_PREFIX)),
    Option.map(String.slice(SSE_DATA_PREFIX.length))
  )
}

export function useAchievementNotifications(
  isAuthenticated: boolean
): AchievementNotifications {
  const { data } = useAchievements()
  const queryClient = useQueryClient()
  const knownUnlockedRef = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<AchievementWithProgress[]>([])

  useEffect(() => {
    if (!isAuthenticated) return

    const abortController = new AbortController()
    let reconnectAttempt = 0

    const connect = async () => {
      try {
        const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
        if (!token || abortController.signal.aborted) return

        const url = `${API_BASE_URL}/api/achievements/events`

        const response = await expoFetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          if (response.status === 401) {
            abortController.abort()
          }
          return
        }

        queryClient.invalidateQueries({
          queryKey: queryKeys.achievements.all,
        })

        reconnectAttempt = 0

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (!abortController.signal.aborted) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            const segments = String.split(buffer, '\n\n')
            buffer = pipe(
              Array.last(segments),
              Option.getOrElse(() => '')
            )
            const messages = Array.dropRight(segments, 1)

            Array.forEach(messages, (msg) => {
              if (!String.trim(msg)) return

              Option.match(parseSSEDataLine(msg), {
                onNone: () => {},
                onSome: (payload) => {
                  try {
                    JSON.parse(payload)
                    queryClient.invalidateQueries({
                      queryKey: queryKeys.achievements.all,
                    })
                  } catch {
                    // Ignore malformed data
                  }
                },
              })
            })
          }
        } finally {
          reader.cancel()
        }
      } catch {
        // Connection error — will reconnect below
      }

      if (
        !abortController.signal.aborted &&
        reconnectAttempt < MAX_RECONNECT_ATTEMPTS
      ) {
        const jitter = Math.random() * 1000
        const delay = Math.min(
          1000 * 2 ** reconnectAttempt + jitter,
          MAX_RECONNECT_DELAY_MS
        )
        reconnectAttempt++
        await new Promise((resolve) => setTimeout(resolve, delay))
        if (!abortController.signal.aborted) {
          connect()
        }
      }
    }

    connect()

    return () => {
      abortController.abort()
    }
  }, [isAuthenticated, queryClient])

  useEffect(() => {
    if (!data) return

    const currentUnlocked = pipe(
      data.achievements,
      Array.filter((a) => a.unlocked),
      Array.map((a) => a.key)
    )

    if (knownUnlockedRef.current === null) {
      knownUnlockedRef.current = new Set(currentUnlocked)
      return
    }

    const known = knownUnlockedRef.current
    const newlyUnlocked = pipe(
      data.achievements,
      Array.filter((a) => a.unlocked && !known.has(a.key))
    )

    if (Array.isNonEmptyReadonlyArray(newlyUnlocked)) {
      Array.forEach(newlyUnlocked, (a) => {
        known.add(a.key)
      })
      setQueue((prev) => [...prev, ...newlyUnlocked])
    }
  }, [data])

  const currentAchievement = pipe(Array.head(queue), Option.getOrNull)

  const dismiss = useCallback(() => {
    setQueue((prev) => pipe(prev, Array.drop(1)))
  }, [])

  return { currentAchievement, dismiss }
}
