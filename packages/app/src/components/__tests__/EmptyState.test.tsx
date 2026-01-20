import { fireEvent, render, screen } from '@testing-library/react-native'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders illustration', () => {
    const { toJSON } = render(
      <EmptyState title="No plants yet" illustration="plant" />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders title', () => {
    render(<EmptyState title="No plants yet" />)
    expect(screen.getByText('No plants yet')).toBeTruthy()
  })

  it('renders description when provided', () => {
    render(
      <EmptyState
        title="No plants yet"
        description="Add your first plant to get started"
      />
    )
    expect(screen.getByText('No plants yet')).toBeTruthy()
    expect(screen.getByText('Add your first plant to get started')).toBeTruthy()
  })

  it('renders action button when provided', () => {
    const onPress = jest.fn()
    render(
      <EmptyState
        title="No plants yet"
        action={{ label: 'Add Plant', onPress }}
      />
    )
    expect(screen.getByText('Add Plant')).toBeTruthy()
  })

  it('calls onPress when action pressed', () => {
    const onPress = jest.fn()
    render(
      <EmptyState
        title="No plants yet"
        action={{ label: 'Add Plant', onPress }}
      />
    )
    fireEvent.press(screen.getByText('Add Plant'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not render action when not provided', () => {
    render(<EmptyState title="No plants yet" />)
    expect(screen.queryByText('Add Plant')).toBeNull()
  })

  it('renders different illustration types', () => {
    const { rerender, toJSON } = render(
      <EmptyState title="Test" illustration="plant" />
    )
    expect(toJSON()).toBeTruthy()

    rerender(<EmptyState title="Test" illustration="notification" />)
    expect(toJSON()).toBeTruthy()

    rerender(<EmptyState title="Test" illustration="achievement" />)
    expect(toJSON()).toBeTruthy()

    rerender(<EmptyState title="Test" illustration="search" />)
    expect(toJSON()).toBeTruthy()
  })
})
