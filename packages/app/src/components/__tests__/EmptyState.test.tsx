import { fireEvent, render, screen } from '@testing-library/react-native'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No Plants" />)
    expect(screen.getByText('No Plants')).toBeTruthy()
  })

  it('renders description when provided', () => {
    render(
      <EmptyState
        title="No Plants"
        description="Add your first plant to get started"
      />
    )
    expect(screen.getByText('Add your first plant to get started')).toBeTruthy()
  })

  it('does not render description when not provided', () => {
    render(<EmptyState title="No Plants" />)
    expect(screen.queryByText('Add your first plant')).toBeNull()
  })

  it('renders action button when provided', () => {
    const onPress = jest.fn()
    render(
      <EmptyState title="No Plants" action={{ label: 'Add Plant', onPress }} />
    )
    expect(screen.getByText('Add Plant')).toBeTruthy()
  })

  it('calls action onPress when button pressed', () => {
    const onPress = jest.fn()
    render(
      <EmptyState title="No Plants" action={{ label: 'Add Plant', onPress }} />
    )

    fireEvent.press(screen.getByText('Add Plant'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not render action button when not provided', () => {
    render(<EmptyState title="No Plants" />)
    expect(screen.queryByText('Add Plant')).toBeNull()
  })

  it('renders with plant illustration by default', () => {
    const { toJSON } = render(<EmptyState title="No Plants" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with notification illustration', () => {
    const { toJSON } = render(
      <EmptyState title="No Notifications" illustration="notification" />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with achievement illustration', () => {
    const { toJSON } = render(
      <EmptyState title="No Achievements" illustration="achievement" />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with search illustration', () => {
    const { toJSON } = render(
      <EmptyState title="No Results" illustration="search" />
    )
    expect(toJSON()).toBeTruthy()
  })
})
