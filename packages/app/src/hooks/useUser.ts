import { useQuery } from '@tanstack/react-query'

interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: string
}

async function fetchUser(): Promise<User> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.user.me()
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Plant Lover',
    avatarUrl: undefined,
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  }
}

export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: fetchUser,
  })
}
