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
import { SuggestionChips } from '../components/SuggestionChips'
import {
  carouselNeighbours,
  chipsSubjectOf,
  GENERAL_TARGET,
  newConversationPayload,
} from '../new-chat-target'

const mockedRunApiEffect = runApiEffect as jest.Mock

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

describe('chipsSubjectOf', () => {
  const monstera = {
    kind: 'plant' as const,
    plantId: 'monstera',
    name: 'Monstera',
  }
  const notOpened = {
    conversation: Option.none(),
    isOpened: false,
    loadedHistoryIsEmpty: false,
  }

  it('suggests general questions before a general chat exists', () => {
    expect(chipsSubjectOf({ ...notOpened, target: GENERAL_TARGET })).toEqual(
      Option.some({ kind: 'general' })
    )
  })

  it('suggests for the plant selected in the carousel', () => {
    expect(chipsSubjectOf({ ...notOpened, target: monstera })).toEqual(
      Option.some({ kind: 'plant', plantId: 'monstera' })
    )
  })

  it('suggests for an opened plant conversation with no messages', () => {
    expect(
      chipsSubjectOf({
        target: GENERAL_TARGET,
        conversation: Option.some({ plantId: 'fern' }),
        isOpened: true,
        loadedHistoryIsEmpty: true,
      })
    ).toEqual(Option.some({ kind: 'plant', plantId: 'fern' }))
  })

  it('suggests nothing for a conversation that has messages', () => {
    expect(
      chipsSubjectOf({
        target: GENERAL_TARGET,
        conversation: Option.some({ plantId: 'fern' }),
        isOpened: true,
        loadedHistoryIsEmpty: false,
      })
    ).toEqual(Option.none())
  })

  it('suggests nothing while an opened conversation is still loading', () => {
    expect(
      chipsSubjectOf({
        target: monstera,
        conversation: Option.none(),
        isOpened: true,
        loadedHistoryIsEmpty: false,
      })
    ).toEqual(Option.none())
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
      'Fern is 2 days late on watering. What should I do?'
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
