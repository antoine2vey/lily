import { render, screen } from '@testing-library/react-native'
import { FeatureList } from '../FeatureList'

describe('FeatureList', () => {
  const mockFeatures = [
    {
      title: 'Unlimited Plants',
      description: 'Add as many plants as you want',
    },
    { title: 'AI Chat', description: 'Get personalized plant care advice' },
    { title: 'Photo Storage', description: 'Unlimited photo storage' },
  ]

  it('renders all feature titles', () => {
    render(<FeatureList features={mockFeatures} />)

    expect(screen.getByText('Unlimited Plants')).toBeTruthy()
    expect(screen.getByText('AI Chat')).toBeTruthy()
    expect(screen.getByText('Photo Storage')).toBeTruthy()
  })

  it('renders all feature descriptions', () => {
    render(<FeatureList features={mockFeatures} />)

    expect(screen.getByText('Add as many plants as you want')).toBeTruthy()
    expect(screen.getByText('Get personalized plant care advice')).toBeTruthy()
    expect(screen.getByText('Unlimited photo storage')).toBeTruthy()
  })

  it('renders single feature', () => {
    render(<FeatureList features={[mockFeatures[0]]} />)

    expect(screen.getByText('Unlimited Plants')).toBeTruthy()
    expect(screen.getByText('Add as many plants as you want')).toBeTruthy()
  })

  it('renders empty list without crashing', () => {
    const { toJSON } = render(<FeatureList features={[]} />)

    expect(toJSON()).toBeTruthy()
  })
})
