import { Result } from 'effect'
import { Alert, type AlertButton } from 'react-native'
import { canopyIds, mockCanopy } from '@/__tests__/fixtures'
import { createCacheTestQueryClient } from '@/__tests__/utils/query-helpers'
import {
  fireEvent,
  renderWithQuery,
  screen,
  waitFor,
} from '@/__tests__/utils/render'

// Stubbed at the network so the card runs through the real API client.
const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

import { toast } from 'sonner-native'
import { useMyCanopy } from '@/hooks/useMyCanopy'
import { queryKeys } from '@/utils/query-keys'
import { CanopyInviteCard } from '../CanopyInviteCard'

// Confirms every alert with its destructive button.
jest
  .spyOn(Alert, 'alert')
  .mockImplementation((_title, _message, buttons?: AlertButton[]) =>
    buttons?.find((b) => b.style === 'destructive')?.onPress?.()
  )

// Renders the card from the cached canopy, as the Canopy screen does.
function CanopyFromCache() {
  const { data } = useMyCanopy()
  return data?.canopy ? (
    <CanopyInviteCard canopy={data.canopy} myUserId={canopyIds.owner} />
  ) : null
}

const renderCard = () => {
  const queryClient = createCacheTestQueryClient()
  queryClient.setQueryData(
    queryKeys.canopy.mine(),
    Result.succeed({ canopy: mockCanopy })
  )
  return renderWithQuery(<CanopyFromCache />, { queryClient })
}

const invitationRow = `canopy-invitation-${canopyIds.invitation}`

describe('CanopyInviteCard withdrawing an invitation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('hides the invitation before the API answers, then confirms', async () => {
    const withdrawn = {
      ...mockCanopy,
      invitations: mockCanopy.invitations.slice(1),
    }
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    renderCard()

    fireEvent.press(
      screen.getByTestId(`canopy-withdraw-${canopyIds.invitation}`)
    )

    await waitFor(() => expect(screen.queryByTestId(invitationRow)).toBeNull())
    expect(toast.success).not.toHaveBeenCalled()

    answer(
      new Response(JSON.stringify(withdrawn), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Invitation withdrawn')
    )
    expect(screen.queryByTestId(invitationRow)).toBeNull()
  })

  it('brings the invitation back and says so when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    renderCard()

    fireEvent.press(
      screen.getByTestId(`canopy-withdraw-${canopyIds.invitation}`)
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Try again.'
      )
    )
    expect(fetchMock).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId(invitationRow)).toBeTruthy())
  })
})
