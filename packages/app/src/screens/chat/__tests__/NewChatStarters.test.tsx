import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Option, Result } from 'effect'
import type { ReactElement } from 'react'

jest.mock('@/utils/client', () => ({
  effectQueryKey: (...key: ReadonlyArray<unknown>) => key,
  runApiEffect: jest.fn(),
}))

import { runApiEffect } from '@/utils/client'
import { PlantCarousel } from '../components/PlantCarousel'
import { FollowUpChips, SuggestionChips } from '../components/SuggestionChips'
import {
  carouselNeighbours,
  chipsOf,
  GENERAL_TARGET,
  historyOf,
  newConversationPayload,
} from '../new-chat-target'

const mockedRunApiEffect = runApiEffect as jest.Mock

const answer = (byEndpoint: Record<string, unknown>) =>
  mockedRunApiEffect.mockImplementation((_group: string, name: string) =>
    Promise.resolve(byEndpoint[name])
  )

const renderWithQueries = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>
  )

const plants = [
  { plantId: 'monstera', name: 'Monstera' },
  { plantId: 'fern', name: 'Fern', imageUrl: 'https://example.com/fern.jpg' },
]

describe('newConversationPayload', () => {
  it('opens a general conversation for the general target', () => {
    expect(newConversationPayload(GENERAL_TARGET)).toEqual({ kind: 'general' })
  })

  it('opens a conversation about the selected plant', () => {
    expect(
      newConversationPayload({
        kind: 'plant',
        plantId: 'monstera',
        name: 'Monstera',
      })
    ).toEqual({ kind: 'plant', plantId: 'monstera' })
  })
})

describe('carouselNeighbours', () => {
  it('gives the first plant next to the general chat', () => {
    expect(carouselNeighbours(plants, GENERAL_TARGET)).toEqual(['monstera'])
  })

  it('gives the plants on either side of the selected one', () => {
    const three = [...plants, { plantId: 'cactus', name: 'Cactus' }]
    expect(
      carouselNeighbours(three, {
        kind: 'plant',
        plantId: 'fern',
        name: 'Fern',
      })
    ).toEqual(['monstera', 'cactus'])
  })

  it('gives only the next plant for the first one', () => {
    expect(
      carouselNeighbours(plants, {
        kind: 'plant',
        plantId: 'monstera',
        name: 'Monstera',
      })
    ).toEqual(['fern'])
  })
})

describe('chipsOf', () => {
  const monstera = {
    kind: 'plant' as const,
    plantId: 'monstera',
    name: 'Monstera',
  }
  const notOpened = {
    conversation: Option.none(),
    isOpened: false,
    history: 'loading' as const,
    isReplying: false,
    isVisiting: true,
    sentIn: [],
  }
  const fernChat = {
    target: GENERAL_TARGET,
    conversation: Option.some({ id: 'conv-fern', plantId: 'fern' }),
    isOpened: true,
    history: 'written' as const,
    isReplying: false,
    isVisiting: true,
    sentIn: [],
  }

  it('offers general starters before a general chat exists', () => {
    expect(chipsOf({ ...notOpened, target: GENERAL_TARGET })).toEqual({
      kind: 'starter',
      subject: { kind: 'general' },
    })
  })

  it('offers starters for the plant selected in the carousel', () => {
    expect(chipsOf({ ...notOpened, target: monstera })).toEqual({
      kind: 'starter',
      subject: { kind: 'plant', plantId: 'monstera' },
    })
  })

  it('offers starters for an opened plant conversation with no messages', () => {
    expect(chipsOf({ ...fernChat, history: 'empty' })).toEqual({
      kind: 'starter',
      subject: { kind: 'plant', plantId: 'fern' },
    })
  })

  it('offers follow-ups for a plant conversation that has messages', () => {
    expect(chipsOf(fernChat)).toEqual({ kind: 'followUp', plantId: 'fern' })
  })

  it('offers nothing for a general conversation that has messages', () => {
    expect(
      chipsOf({
        ...fernChat,
        conversation: Option.some({ id: 'conv-general' }),
      })
    ).toEqual({ kind: 'none' })
  })

  it('offers nothing while an opened conversation is still loading', () => {
    expect(
      chipsOf({ ...fernChat, target: monstera, conversation: Option.none() })
    ).toEqual({ kind: 'none' })
    expect(chipsOf({ ...fernChat, history: 'loading' })).toEqual({
      kind: 'none',
    })
  })

  it('offers nothing while a reply is streaming', () => {
    expect(chipsOf({ ...fernChat, isReplying: true })).toEqual({ kind: 'none' })
  })

  it('offers nothing once the user has sent a message in the conversation during this visit', () => {
    expect(chipsOf({ ...fernChat, sentIn: ['conv-fern'] })).toEqual({
      kind: 'none',
    })
  })

  it('offers nothing while the chat is out of view', () => {
    expect(chipsOf({ ...fernChat, isVisiting: false })).toEqual({
      kind: 'none',
    })
    expect(
      chipsOf({ ...notOpened, target: monstera, isVisiting: false })
    ).toEqual({ kind: 'none' })
  })

  it('keeps the follow-ups of a conversation when the user wrote in another one', () => {
    expect(chipsOf({ ...fernChat, sentIn: ['conv-aloe'] })).toEqual({
      kind: 'followUp',
      plantId: 'fern',
    })
  })
})

describe('historyOf', () => {
  it('tells a history that is loading, empty or written apart', () => {
    expect(historyOf(undefined)).toBe('loading')
    expect(historyOf([])).toBe('empty')
    expect(historyOf([{ id: 'message-1' }])).toBe('written')
  })
})

describe('FollowUpChips', () => {
  beforeEach(() => mockedRunApiEffect.mockReset())

  it('shows the follow-ups the server kept for the plant and sends the one tapped', async () => {
    mockedRunApiEffect.mockResolvedValue(
      Result.succeed({
        suggestions: [
          { id: '0:late:watering', text: 'Should I water my Fern now?' },
          { id: '1:none', text: 'How much light does it need?' },
        ],
      })
    )
    const onSelect = jest.fn()
    renderWithQueries(<FollowUpChips plantId="fern" onSelect={onSelect} />)

    fireEvent.press(await screen.findByText('How much light does it need?'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('How much light does it need?', {
      id: '1:none',
      source: 'follow_up',
    })
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Should I water my Fern now?')).toBeTruthy()
    expect(mockedRunApiEffect.mock.calls).toEqual([
      [
        'aiChat',
        'listChatFollowUps',
        { query: { plantId: 'fern', language: 'en' } },
      ],
    ])
  })

  it('renders no row while the follow-ups load and asks for no starters', () => {
    mockedRunApiEffect.mockReturnValue(new Promise(() => {}))
    renderWithQueries(<FollowUpChips plantId="fern" onSelect={jest.fn()} />)

    expect(screen.queryByTestId('chat-follow-ups')).toBeNull()
    expect(mockedRunApiEffect.mock.calls).toEqual([
      [
        'aiChat',
        'listChatFollowUps',
        { query: { plantId: 'fern', language: 'en' } },
      ],
    ])
  })

  it('falls back to the starters of the plant when it has no follow-ups', async () => {
    answer({
      listChatFollowUps: Result.succeed({ suggestions: [] }),
      listChatSuggestions: Result.succeed({
        suggestions: [
          { id: 'care', text: 'How do I care for Fern?' },
          { id: 'repot', text: 'When should I repot Fern?' },
        ],
      }),
    })
    const onSelect = jest.fn()
    renderWithQueries(<FollowUpChips plantId="fern" onSelect={onSelect} />)

    fireEvent.press(await screen.findByText('When should I repot Fern?'))

    expect(onSelect).toHaveBeenCalledWith('When should I repot Fern?', {
      id: 'repot',
      source: 'starter',
    })
    expect(screen.getByTestId('chat-follow-ups')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(mockedRunApiEffect).toHaveBeenCalledWith(
      'aiChat',
      'listChatSuggestions',
      { query: { plantId: 'fern', language: 'en' } }
    )
  })

  it('falls back to the starters of the plant when the follow-ups fail', async () => {
    answer({
      listChatFollowUps: Result.fail({ _tag: 'PlantNotFoundError' }),
      listChatSuggestions: Result.succeed({
        suggestions: [{ id: 'care', text: 'How do I care for Fern?' }],
      }),
    })
    renderWithQueries(<FollowUpChips plantId="fern" onSelect={jest.fn()} />)

    expect(await screen.findByText('How do I care for Fern?')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('falls back to the plant questions when neither follow-ups nor starters come', async () => {
    answer({
      listChatFollowUps: Result.succeed({ suggestions: [] }),
      listChatSuggestions: Result.fail({ _tag: 'PlantNotFoundError' }),
    })
    const onSelect = jest.fn()
    renderWithQueries(<FollowUpChips plantId="fern" onSelect={onSelect} />)

    fireEvent.press(await screen.findByText('How to care for this plant?'))

    expect(onSelect).toHaveBeenCalledWith('How to care for this plant?', {
      id: 'suggestions.plant.howToCare',
      source: 'starter',
    })
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})

describe('SuggestionChips', () => {
  beforeEach(() => mockedRunApiEffect.mockReset())

  it('asks broad questions that name no plant in a general chat', () => {
    renderWithQueries(
      <SuggestionChips subject={{ kind: 'general' }} onSelect={jest.fn()} />
    )

    expect(screen.getByText('Which plants are safe for pets?')).toBeTruthy()
    expect(screen.getByText('Which plants do well in low light?')).toBeTruthy()
    expect(screen.getByText('How do I get rid of fungus gnats?')).toBeTruthy()
    expect(screen.getByText('What are easy plants for beginners?')).toBeTruthy()
    expect(screen.queryByText('How to care for this plant?')).toBeNull()
    expect(mockedRunApiEffect).not.toHaveBeenCalled()
  })

  it('names a general chip as general when it is tapped', () => {
    const onSelect = jest.fn()
    renderWithQueries(
      <SuggestionChips subject={{ kind: 'general' }} onSelect={onSelect} />
    )

    fireEvent.press(screen.getByText('Which plants are safe for pets?'))

    expect(onSelect).toHaveBeenCalledWith('Which plants are safe for pets?', {
      id: 'suggestions.general.petSafePlants',
      source: 'general',
    })
  })

  it('shows the suggestions the server made for the plant and sends one', async () => {
    mockedRunApiEffect.mockResolvedValue(
      Result.succeed({
        suggestions: [
          {
            id: 'overdue-watering',
            text: 'Fern is 2 days late on watering. What should I do?',
          },
          { id: 'care', text: 'How do I care for Fern?' },
        ],
      })
    )
    const onSelect = jest.fn()
    renderWithQueries(
      <SuggestionChips
        subject={{ kind: 'plant', plantId: 'fern' }}
        onSelect={onSelect}
      />
    )

    fireEvent.press(
      await screen.findByText(
        'Fern is 2 days late on watering. What should I do?'
      )
    )

    expect(onSelect).toHaveBeenCalledWith(
      'Fern is 2 days late on watering. What should I do?',
      { id: 'overdue-watering', source: 'starter' }
    )
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByText('How to care for this plant?')).toBeNull()
    expect(mockedRunApiEffect).toHaveBeenCalledWith(
      'aiChat',
      'listChatSuggestions',
      { query: { plantId: 'fern', language: 'en' } }
    )
  })

  it('shows no chips while the suggestions load', () => {
    mockedRunApiEffect.mockReturnValue(new Promise(() => {}))
    renderWithQueries(
      <SuggestionChips
        subject={{ kind: 'plant', plantId: 'fern' }}
        onSelect={jest.fn()}
      />
    )

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('falls back to the plant questions when the suggestions fail', async () => {
    mockedRunApiEffect.mockResolvedValue(
      Result.fail({ _tag: 'PlantNotFoundError' })
    )
    renderWithQueries(
      <SuggestionChips
        subject={{ kind: 'plant', plantId: 'fern' }}
        onSelect={jest.fn()}
      />
    )

    expect(await screen.findByText('How to care for this plant?')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByText('Which plants are safe for pets?')).toBeNull()
  })
})

describe('PlantCarousel', () => {
  it('offers the general chat first, then each plant by name', () => {
    render(
      <PlantCarousel
        plants={plants}
        selected={GENERAL_TARGET}
        onSelect={jest.fn()}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      'General',
      'Monstera',
      'Fern',
    ])
    expect(
      screen.getByRole('button', { name: 'General', selected: true })
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Monstera', selected: false })
    ).toBeTruthy()
  })

  it('marks the selected plant', () => {
    render(
      <PlantCarousel
        plants={plants}
        selected={{ kind: 'plant', plantId: 'fern', name: 'Fern' }}
        onSelect={jest.fn()}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Fern', selected: true })
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'General', selected: false })
    ).toBeTruthy()
  })

  it('selects a plant when it is tapped', () => {
    const onSelect = jest.fn()
    render(
      <PlantCarousel
        plants={plants}
        selected={GENERAL_TARGET}
        onSelect={onSelect}
      />
    )

    fireEvent.press(screen.getByRole('button', { name: 'Monstera' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'plant',
      plantId: 'monstera',
      name: 'Monstera',
    })
  })

  it('does not reselect the item already selected', () => {
    const onSelect = jest.fn()
    render(
      <PlantCarousel
        plants={plants}
        selected={GENERAL_TARGET}
        onSelect={onSelect}
      />
    )

    fireEvent.press(screen.getByRole('button', { name: 'General' }))

    expect(onSelect).not.toHaveBeenCalled()
  })
})
