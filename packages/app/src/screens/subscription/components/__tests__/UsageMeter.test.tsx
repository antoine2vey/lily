import { render, screen } from '@testing-library/react-native'
import { UsageMeter } from '../UsageMeter'

describe('UsageMeter', () => {
  it('renders label', () => {
    render(<UsageMeter icon="eco" label="Plants" current={5} max={10} />)

    expect(screen.getByText('Plants')).toBeTruthy()
  })

  it('displays current/max count', () => {
    render(<UsageMeter icon="eco" label="Plants" current={5} max={10} />)

    expect(screen.getByText('5/10')).toBeTruthy()
  })

  it('displays different counts', () => {
    render(<UsageMeter icon="chat" label="AI Chats" current={25} max={50} />)

    expect(screen.getByText('AI Chats')).toBeTruthy()
    expect(screen.getByText('25/50')).toBeTruthy()
  })

  it('handles at limit state', () => {
    render(<UsageMeter icon="eco" label="Plants" current={10} max={10} />)

    expect(screen.getByText('10/10')).toBeTruthy()
  })

  it('handles over limit state', () => {
    render(<UsageMeter icon="eco" label="Plants" current={12} max={10} />)

    expect(screen.getByText('12/10')).toBeTruthy()
  })

  it('handles zero values', () => {
    render(<UsageMeter icon="eco" label="Plants" current={0} max={10} />)

    expect(screen.getByText('0/10')).toBeTruthy()
  })
})
