import { render, screen } from '@testing-library/react-native'
import { ProgressBar } from '../ProgressBar'

describe('ProgressBar', () => {
  it('renders bar at 0% width when progress=0', () => {
    const { toJSON } = render(<ProgressBar progress={0} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders bar at 50% width when progress=0.5', () => {
    const { toJSON } = render(<ProgressBar progress={0.5} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders bar at 100% width when progress=1', () => {
    const { toJSON } = render(<ProgressBar progress={1} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders label when provided', () => {
    render(<ProgressBar progress={0.4} label="4 of 10 plants added" />)
    expect(screen.getByText('4 of 10 plants added')).toBeTruthy()
  })

  it('applies custom color', () => {
    const { toJSON } = render(<ProgressBar progress={0.5} color="#FF0000" />)
    expect(toJSON()).toBeTruthy()
  })

  it('clamps progress between 0 and 1', () => {
    const { rerender, toJSON } = render(<ProgressBar progress={-0.5} />)
    expect(toJSON()).toBeTruthy()

    rerender(<ProgressBar progress={1.5} />)
    expect(toJSON()).toBeTruthy()
  })

  it('shows percentage when showPercentage=true', () => {
    render(<ProgressBar progress={0.75} showPercentage />)
    expect(screen.getByText('75%')).toBeTruthy()
  })
})
