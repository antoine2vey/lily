import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

jest.mock('@/utils/client', () => ({
  effectQueryKey: (...key: ReadonlyArray<unknown>) => key,
  runApiEffect: jest.fn(),
}))
jest.mock('@/hooks/useLocalization', () => ({
  useLocalization: () => ({ language: 'en' }),
}))
jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }))

import { useIsFocused } from 'expo-router'
import { useChatSuggestionsVisit } from '../useChatSuggestions'

const mockedUseIsFocused = useIsFocused as jest.Mock

const followUpsKey = [
  'aiChat',
  'listChatFollowUps',
  { query: { plantId: 'fern', language: 'en' } },
]
const startersKey = [
  'aiChat',
  'listChatSuggestions',
  { query: { plantId: 'fern', language: 'en' } },
]

const visitWithCachedChips = () => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(followUpsKey, 'fern follow-ups')
  queryClient.setQueryData(startersKey, 'fern starters')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  mockedUseIsFocused.mockReturnValue(true)
  const rendered = renderHook(() => useChatSuggestionsVisit(), { wrapper })
  const focus = (isFocused: boolean) => {
    mockedUseIsFocused.mockReturnValue(isFocused)
    rendered.rerender({})
  }
  const cachedChips = () => [
    queryClient.getQueryData(followUpsKey),
    queryClient.getQueryData(startersKey),
  ]
  return { ...rendered, focus, cachedChips }
}

describe('useChatSuggestionsVisit', () => {
  it('keeps the chips and the sent conversations while the chat has focus', () => {
    const { result, cachedChips } = visitWithCachedChips()

    act(() => result.current.markSent('conv-fern'))

    expect(result.current.isVisiting).toBe(true)
    expect(result.current.sentIn).toEqual(['conv-fern'])
    expect(cachedChips()).toEqual(['fern follow-ups', 'fern starters'])
  })

  it('drops the chips and forgets the sent conversations when the chat loses focus', () => {
    const { result, focus, cachedChips } = visitWithCachedChips()
    act(() => result.current.markSent('conv-fern'))

    focus(false)

    expect(result.current.isVisiting).toBe(false)
    expect(result.current.sentIn).toEqual([])
    expect(cachedChips()).toEqual([undefined, undefined])
  })

  it('starts the next visit with nothing sent', () => {
    const { result, focus } = visitWithCachedChips()
    act(() => result.current.markSent('conv-fern'))

    focus(false)
    focus(true)

    expect(result.current.isVisiting).toBe(true)
    expect(result.current.sentIn).toEqual([])
  })

  it('drops the chips when the chat closes', () => {
    const { unmount, cachedChips } = visitWithCachedChips()

    unmount()

    expect(cachedChips()).toEqual([undefined, undefined])
  })

  it('records no conversation for a chat that has none yet', () => {
    const { result } = visitWithCachedChips()

    act(() => result.current.markSent(undefined))

    expect(result.current.sentIn).toEqual([])
  })
})
