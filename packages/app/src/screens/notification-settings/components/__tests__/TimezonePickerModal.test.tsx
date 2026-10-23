import { fireEvent, render, screen } from '@testing-library/react-native'
import { TimezonePickerModal } from '../TimezonePickerModal'

const renderAndSearch = (query: string) => {
  render(
    <TimezonePickerModal
      visible
      onClose={jest.fn()}
      selectedTimezone="UTC"
      onTimezoneChange={jest.fn()}
    />
  )
  fireEvent.changeText(
    screen.getByPlaceholderText('Search timezones...'),
    query
  )
}

describe('TimezonePickerModal', () => {
  it('shows the no-results empty state when the search matches nothing', () => {
    renderAndSearch('zzzz')

    expect(screen.getByTestId('mascot-lookAround')).toBeTruthy()
    expect(screen.getByText('No time zone found')).toBeTruthy()
    expect(screen.queryByText('New York (ET)')).toBeNull()
  })

  it('lists matching time zones without the empty state', () => {
    renderAndSearch('new york')

    expect(screen.getByText('New York (ET)')).toBeTruthy()
    expect(screen.queryByTestId('mascot-lookAround')).toBeNull()
  })
})
