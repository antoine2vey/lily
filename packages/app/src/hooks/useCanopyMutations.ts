import type { Canopy, CanopyResponse, UpdateCanopyRequest } from '@lily/shared'
import {
  type QueryClient,
  type UseMutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Result } from 'effect'
import type { InviteToken } from '@/utils/canopy-invite-token'
import {
  type ApiFailure,
  type ApiResult,
  apiEffectRunner,
} from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export const useCanopyMutation = <A, V = void>(
  options: UseMutationOptions<A, ApiFailure, V>
) => useMutation(options)

const setMyCanopy = (queryClient: QueryClient, canopy: Canopy | null) =>
  queryClient.setQueryData<ApiResult<CanopyResponse>>(
    queryKeys.canopy.mine(),
    Result.succeed({ canopy })
  )

// Joining, leaving, removing a member and dissolving move plants and rooms
// between owners.
export const refreshOwnedData = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
}

export function useCreateCanopy() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (name: string) =>
      apiEffectRunner('canopy', 'createCanopy', { payload: { name } }),
    onSuccess: (canopy) => setMyCanopy(queryClient, canopy),
  })
}

export function useUpdateCanopy() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (payload: UpdateCanopyRequest) =>
      apiEffectRunner('canopy', 'updateMyCanopy', { payload }),
    onSuccess: (canopy) => setMyCanopy(queryClient, canopy),
  })
}

export function useRemoveCanopyMember() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (userId: string) =>
      apiEffectRunner('canopy', 'removeCanopyMember', { params: { userId } }),
    onSuccess: (canopy) => {
      setMyCanopy(queryClient, canopy)
      refreshOwnedData(queryClient)
    },
  })
}

export function useCreateCanopyInvite() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: () => apiEffectRunner('canopy', 'createCanopyInvite', {}),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.canopy.all }),
  })
}

export function useRevokeCanopyInvite() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: () => apiEffectRunner('canopy', 'revokeCanopyInvite', {}),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.canopy.all }),
  })
}

export function useLeaveCanopy() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: () => apiEffectRunner('canopy', 'leaveMyCanopy', {}),
    onSuccess: () => {
      setMyCanopy(queryClient, null)
      refreshOwnedData(queryClient)
    },
  })
}

export function useDeleteCanopy() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: () => apiEffectRunner('canopy', 'deleteMyCanopy', {}),
    onSuccess: () => {
      setMyCanopy(queryClient, null)
      refreshOwnedData(queryClient)
    },
  })
}

export function useAcceptCanopyInvite() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (token: InviteToken) =>
      apiEffectRunner('canopy', 'acceptCanopyInvite', { payload: { token } }),
    onSuccess: (canopy) => {
      setMyCanopy(queryClient, canopy)
      refreshOwnedData(queryClient)
    },
  })
}

export function useInviteToCanopy() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (inviteeId: string) =>
      apiEffectRunner('canopy', 'sendCanopyInvitation', {
        payload: { inviteeId },
      }),
    onSuccess: (canopy) => setMyCanopy(queryClient, canopy),
  })
}

export function useWithdrawCanopyInvitation() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (invitationId: string) =>
      apiEffectRunner('canopy', 'withdrawCanopyInvitation', {
        params: { invitationId },
      }),
    onSuccess: (canopy) => setMyCanopy(queryClient, canopy),
  })
}

export function useAcceptCanopyInvitation() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (invitationId: string) =>
      apiEffectRunner('canopy', 'acceptCanopyInvitation', {
        params: { invitationId },
      }),
    onSuccess: (canopy) => {
      setMyCanopy(queryClient, canopy)
      refreshOwnedData(queryClient)
    },
  })
}

export function useDeclineCanopyInvitation() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (invitationId: string) =>
      apiEffectRunner('canopy', 'declineCanopyInvitation', {
        params: { invitationId },
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.canopy.all }),
  })
}
