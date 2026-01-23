import { render } from '@testing-library/react-native'
import { SuggestionChips } from '../components/SuggestionChips'

describe('SuggestionChips', () => {
  const mockOnSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders suggestion chips', () => {
    const { toJSON } = render(<SuggestionChips onSelect={mockOnSelect} />)
    expect(toJSON()).toBeTruthy()
  })
})
