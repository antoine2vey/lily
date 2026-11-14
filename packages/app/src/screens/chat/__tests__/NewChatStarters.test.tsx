import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantCarousel } from '../components/PlantCarousel'
import { SuggestionChips } from '../components/SuggestionChips'
import { GENERAL_TARGET, newConversationPayload } from '../new-chat-target'

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

describe('SuggestionChips', () => {
  it('asks broad questions that name no plant in a general chat', () => {
    render(<SuggestionChips kind="general" onSelect={jest.fn()} />)

    expect(screen.getByText('Which plants are safe for pets?')).toBeTruthy()
    expect(screen.getByText('Which plants do well in low light?')).toBeTruthy()
    expect(screen.getByText('How do I get rid of fungus gnats?')).toBeTruthy()
    expect(screen.getByText('What are easy plants for beginners?')).toBeTruthy()
    expect(screen.queryByText('How to care for this plant?')).toBeNull()
  })

  it('asks about the plant in a plant chat', () => {
    render(<SuggestionChips kind="plant" onSelect={jest.fn()} />)

    expect(screen.getByText('How to care for this plant?')).toBeTruthy()
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
