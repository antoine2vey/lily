import { fireEvent, render, screen } from '@testing-library/react-native'
import { SectionHeader } from '../SectionHeader'

describe('SectionHeader', () => {
  it('renders title', () => {
    render(<SectionHeader title="My Plants" />)
    expect(screen.getByText('My Plants')).toBeTruthy()
  })

  it('renders action when provided', () => {
    const onPress = jest.fn()
    render(
      <SectionHeader title="My Plants" action={{ label: 'See All', onPress }} />
    )
    expect(screen.getByText('See All')).toBeTruthy()
  })

  it('does not render action when not provided', () => {
    render(<SectionHeader title="My Plants" />)
    expect(screen.queryByText('See All')).toBeNull()
  })

  it('calls action onPress when pressed', () => {
    const onPress = jest.fn()
    render(
      <SectionHeader title="My Plants" action={{ label: 'See All', onPress }} />
    )

    fireEvent.press(screen.getByText('See All'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders with long title', () => {
    render(
      <SectionHeader title="This is a very long section title that might overflow" />
    )
    expect(
      screen.getByText('This is a very long section title that might overflow')
    ).toBeTruthy()
  })

  it('renders title and action side by side', () => {
    const { toJSON } = render(
      <SectionHeader
        title="My Plants"
        action={{ label: 'See All', onPress: jest.fn() }}
      />
    )
    expect(toJSON()).toBeTruthy()
  })
})
