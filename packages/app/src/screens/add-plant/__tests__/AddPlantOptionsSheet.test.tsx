import { fireEvent, render, screen } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'
import { AddPlantOptionsSheet } from '../AddPlantOptionsSheet'

describe('AddPlantOptionsSheet', () => {
  const defaultProps = {
    visible: true,
    onClose: vi.fn(),
    onSelectAI: vi.fn(),
    onSelectScan: vi.fn(),
    onSelectManual: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title "Add Plant"', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    expect(screen.getByText('Add Plant')).toBeTruthy()
  })

  it('renders all 3 options', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    expect(screen.getByText('Identify with AI')).toBeTruthy()
    expect(screen.getByText('Scan nursery card')).toBeTruthy()
    expect(screen.getByText('Add manually')).toBeTruthy()
  })

  it('renders subtitles for all options', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    expect(screen.getByText('Snap a photo for instant info')).toBeTruthy()
    expect(screen.getByText('Read the tag from the store')).toBeTruthy()
    expect(screen.getByText('Type in the name yourself')).toBeTruthy()
  })

  it('calls onSelectAI when AI option pressed', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Identify with AI'))
    expect(defaultProps.onSelectAI).toHaveBeenCalled()
  })

  it('calls onSelectScan when scan option pressed', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Scan nursery card'))
    expect(defaultProps.onSelectScan).toHaveBeenCalled()
  })

  it('calls onSelectManual when manual option pressed', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Add manually'))
    expect(defaultProps.onSelectManual).toHaveBeenCalled()
  })

  it('closes sheet after selection', () => {
    render(<AddPlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Identify with AI'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('does not render when not visible', () => {
    render(<AddPlantOptionsSheet {...defaultProps} visible={false} />)
    expect(screen.queryByText('Add Plant')).toBeNull()
  })
})
