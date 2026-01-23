import { render, screen } from '@testing-library/react-native'
import { ProgressBar } from '../ProgressBar'

describe('ProgressBar', () => {
  it('renders with basic progress', () => {
    const { toJSON } = render(<ProgressBar progress={0.5} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with label', () => {
    render(<ProgressBar progress={0.5} label="Loading" />)
    expect(screen.getByText('Loading')).toBeTruthy()
  })

  it('renders with percentage', () => {
    render(<ProgressBar progress={0.75} showPercentage />)
    expect(screen.getByText('75%')).toBeTruthy()
  })

  it('renders with both label and percentage', () => {
    render(<ProgressBar progress={0.5} label="Progress" showPercentage />)
    expect(screen.getByText('Progress')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('clamps progress to 0 when negative', () => {
    render(<ProgressBar progress={-0.5} showPercentage />)
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it('clamps progress to 100 when over 1', () => {
    render(<ProgressBar progress={1.5} showPercentage />)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('renders 0% for zero progress', () => {
    render(<ProgressBar progress={0} showPercentage />)
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it('renders 100% for full progress', () => {
    render(<ProgressBar progress={1} showPercentage />)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('rounds percentage to whole number', () => {
    render(<ProgressBar progress={0.333} showPercentage />)
    expect(screen.getByText('33%')).toBeTruthy()
  })

  it('applies custom color', () => {
    const { toJSON } = render(<ProgressBar progress={0.5} color="#FF0000" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies custom height', () => {
    const { toJSON } = render(<ProgressBar progress={0.5} height={16} />)
    expect(toJSON()).toBeTruthy()
  })
})
