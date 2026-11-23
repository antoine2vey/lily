import { UserSettings } from '@lily/shared'
import { act, waitFor } from '@testing-library/react-native'
import { Schema } from 'effect'
import { mockUserSettings } from '@/__tests__/fixtures'
import { ok, type SentRequest, stubApi } from '@/__tests__/utils/fake-api'
import {
  afterApiRequest,
  renderQueryHook,
} from '@/__tests__/utils/query-helpers'
import { useEffectQuery } from '@/utils/client'
import { USER_SETTINGS_PARAMS } from '@/utils/query-keys'
import { useUpdateProfile } from '../useUpdateProfile'

const encodeSettings = Schema.encodeSync(UserSettings)

describe('useUpdateProfile', () => {
  it('uploads the avatar, saves the given fields and shows the saved profile', async () => {
    let settings: UserSettings = { ...mockUserSettings, lastName: 'Lovelace' }
    const api = stubApi(({ method, path, body }: SentRequest) => {
      if (method === 'POST' && path === '/users/avatar') {
        return ok({ url: 'https://example.com/avatar.jpg' })
      }
      if (method === 'PUT' && path === '/users/settings') {
        settings = { ...settings, ...(body as Partial<UserSettings>) }
      }
      return ok(encodeSettings(settings))
    })
    const { result } = renderQueryHook(() => ({
      settings: useEffectQuery('users', 'getUserSettings', USER_SETTINGS_PARAMS)
        .data,
      update: useUpdateProfile(),
    }))
    await waitFor(
      () => expect(result.current.settings?.lastName).toBe('Lovelace'),
      afterApiRequest
    )

    await act(() =>
      result.current.update.mutateAsync({
        avatarUri: 'file:///var/mobile/avatar.jpg',
        firstName: 'Ada',
        lastName: null,
      })
    )

    expect(
      api.sent
        .filter((request) => request.method !== 'GET')
        .map(({ method, path, body }) => ({ method, path, body }))
    ).toEqual([
      { method: 'POST', path: '/users/avatar', body: [['files', 'file']] },
      {
        method: 'PUT',
        path: '/users/settings',
        body: { firstName: 'Ada', lastName: null },
      },
    ])
    await waitFor(() => {
      expect(result.current.settings?.firstName).toBe('Ada')
      expect(result.current.settings?.lastName).toBeNull()
    }, afterApiRequest)
  })
})
