import { Navigate, Outlet } from 'react-router-dom'
import { getAccessToken, getRefreshToken } from '@/lib/auth'

export const AuthGate = () => {
  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()

  // Allow through if we have any credential — an expired access token with a
  // valid refresh token is fine; apiRequest will refresh proactively before
  // the first request fires.
  if (!accessToken && !refreshToken) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
