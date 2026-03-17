import type { UserRole, UserStatus } from '@lily/shared'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import {
  clearAuth,
  getApiUrl,
  setAccessToken,
  setRefreshToken,
} from '@/lib/auth'

interface MagicLinkResponse {
  readonly message: string
  readonly instantCode?: string
}

interface AuthResponse {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly role: UserRole
    readonly status: UserStatus
  }
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
}

export const useSendMagicLink = () =>
  useMutation({
    mutationFn: async (email: string) => {
      const baseUrl = getApiUrl()
      const response = await fetch(`${baseUrl}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(body)
      }

      return response.json() as Promise<MagicLinkResponse>
    },
  })

export const useVerifyCode = () =>
  useMutation({
    mutationFn: async (code: string) => {
      const baseUrl = getApiUrl()
      const response = await fetch(`${baseUrl}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(body)
      }

      const data = (await response.json()) as AuthResponse

      if (data.user.role !== 'admin') {
        throw new Error('Access denied — admin role required')
      }

      setAccessToken(data.accessToken)
      setRefreshToken(data.refreshToken)
      return data
    },
  })

export const useLogout = () =>
  useMutation({
    mutationFn: async () => {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' })
      } finally {
        clearAuth()
      }
    },
  })
