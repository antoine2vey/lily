import { Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

interface MyDelegationsParams {
  role?: string
  status?: string
}

export function useMyDelegations(params?: MyDelegationsParams) {
  return useEffectQuery('delegations', 'getMyDelegations', {
    urlParams: {
      page: '1',
      limit: '20',
      role: pipe(
        Option.fromNullable(params?.role),
        Option.getOrElse(() => 'both')
      ),
      ...(params?.status ? { status: params.status } : {}),
    },
  })
}
