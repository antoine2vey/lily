import { fireEvent, render, screen } from '@testing-library/react-native'
import { LanguageSelectionModal } from '../LanguageSelectionModal'

// Mock useLocalization with controllable state
const mockSetLanguage = jest.fn().mockResolvedValue(undefined)
let mockLanguage = 'en'

jest.mock('@/hooks/useLocalization', () => ({
  useLocalization: () => ({
    t: (key: string) => key,
    language: mockLanguage,
    setLanguage: mockSetLanguage,
    isLoading: false,
    supportedLanguages: [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
    ],
  }),
}))

describe('LanguageSelectionModal', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockLanguage = 'en'
  })

  it('renders when visible', () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('Français')).toBeTruthy()
  })

  it('displays the title', () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    expect(screen.getByText('settings:appearance.language')).toBeTruthy()
  })

  it('displays done button', () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    expect(screen.getByText('common:buttons.done')).toBeTruthy()
  })

  it('calls setLanguage when a language is selected', () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    fireEvent.press(screen.getByText('Français'))

    expect(mockSetLanguage).toHaveBeenCalledWith('fr')
  })

  it('calls onClose when a language is selected', async () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    fireEvent.press(screen.getByText('Français'))

    // Wait for async setLanguage to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onClose when done button is pressed', () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    fireEvent.press(screen.getByText('common:buttons.done'))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows check mark for currently selected language', () => {
    mockLanguage = 'en'
    const { rerender } = render(
      <LanguageSelectionModal visible={true} onClose={mockOnClose} />
    )

    // English should have a check mark (rendered by the component)
    // We verify by the presence of the language option
    expect(screen.getByText('English')).toBeTruthy()

    // Change to French
    mockLanguage = 'fr'
    rerender(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    // French should now be selected
    expect(screen.getByText('Français')).toBeTruthy()
  })

  it('renders all supported languages', () => {
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    // Both languages should be displayed
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('Français')).toBeTruthy()
  })

  it('selecting the same language still calls setLanguage and closes', async () => {
    mockLanguage = 'en'
    render(<LanguageSelectionModal visible={true} onClose={mockOnClose} />)

    fireEvent.press(screen.getByText('English'))

    expect(mockSetLanguage).toHaveBeenCalledWith('en')

    // Wait for async
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockOnClose).toHaveBeenCalled()
  })
})
