import { fireEvent, render, screen } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'
import { WizardHeader } from '../WizardHeader'

describe('WizardHeader', () => {
  const defaultProps = {
    step: 1,
    totalSteps: 3,
    onBack: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders back button', () => {
    render(<WizardHeader {...defaultProps} />)
    const backButton = screen.getByRole('button')
    expect(backButton).toBeTruthy()
  })

  it('renders title "Add New Plant" by default', () => {
    render(<WizardHeader {...defaultProps} />)
    expect(screen.getByText('Add New Plant')).toBeTruthy()
  })

  it('renders custom title when provided', () => {
    render(<WizardHeader {...defaultProps} title="Edit Plant" />)
    expect(screen.getByText('Edit Plant')).toBeTruthy()
  })

  it('shows correct step text', () => {
    render(<WizardHeader {...defaultProps} />)
    expect(screen.getByText('1 of 3')).toBeTruthy()
  })

  it('shows correct step text for step 2', () => {
    render(<WizardHeader {...defaultProps} step={2} />)
    expect(screen.getByText('2 of 3')).toBeTruthy()
  })

  it('shows correct step text for step 3', () => {
    render(<WizardHeader {...defaultProps} step={3} />)
    expect(screen.getByText('3 of 3')).toBeTruthy()
  })

  it('calls onBack when back pressed', () => {
    render(<WizardHeader {...defaultProps} />)
    const backButton = screen.getByRole('button')
    fireEvent.press(backButton)
    expect(defaultProps.onBack).toHaveBeenCalled()
  })
})
