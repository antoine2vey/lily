import { fireEvent, render, screen } from '@testing-library/react-native'
import { SectionHeader } from '../SectionHeader'

describe('SectionHeader', () => {
  it('renders title', () => {
    render(<SectionHeader title="Recent Activity" />)
    expect(screen.getByText('Recent Activity')).toBeTruthy()
  })

  it('does not render action when not provided', () => {
    render(<SectionHeader title="Gallery" />)
    expect(screen.queryByText('See All')).toBeNull()
  })

  it('renders action label when provided', () => {
    const onPress = jest.fn()
    render(
      <SectionHeader
        title="Recent Activity"
        action={{ label: 'See All', onPress }}
      />
    )
    expect(screen.getByText('See All')).toBeTruthy()
  })

  it('calls onPress when action pressed', () => {
    const onPress = jest.fn()
    render(
      <SectionHeader
        title="Recent Activity"
        action={{ label: 'See All', onPress }}
      />
    )
    fireEvent.press(screen.getByText('See All'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
