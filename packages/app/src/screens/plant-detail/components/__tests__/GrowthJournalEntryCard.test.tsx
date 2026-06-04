import { fireEvent, render, screen } from '@testing-library/react-native'
import { GrowthJournalEntryCard } from '../GrowthJournalEntryCard'

const photos = [
  {
    id: 'photo-1',
    url: 'https://example.com/1.jpg',
    createdAt: new Date('2025-06-20T10:00:00Z'),
  },
  {
    id: 'photo-2',
    url: 'https://example.com/2.jpg',
    createdAt: new Date('2025-06-10T10:00:00Z'),
  },
  {
    id: 'photo-3',
    url: 'https://example.com/3.jpg',
    createdAt: new Date('2025-05-01T10:00:00Z'),
  },
]

const makeProps = () => ({
  photos,
  plantDateAdded: new Date('2025-01-01T00:00:00Z'),
  totalCount: 3,
  onPhotoPress: jest.fn(),
  onPhoto: jest.fn(),
  onViewJournal: jest.fn(),
})

describe('GrowthJournalEntryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the card with the journal title', () => {
    render(<GrowthJournalEntryCard {...makeProps()} />)
    expect(screen.getByTestId('growth-journal-entry-card')).toBeTruthy()
    expect(screen.getByText('Growth Journal')).toBeTruthy()
  })

  it('renders a scrollable tile for every photo', () => {
    render(<GrowthJournalEntryCard {...makeProps()} />)
    expect(screen.getByTestId('growth-journal-preview-scroll')).toBeTruthy()
    expect(screen.getByTestId('growth-journal-preview-photo-1')).toBeTruthy()
    expect(screen.getByTestId('growth-journal-preview-photo-2')).toBeTruthy()
    expect(screen.getByTestId('growth-journal-preview-photo-3')).toBeTruthy()
  })

  it('calls onPhotoPress when a tile is tapped', () => {
    const props = makeProps()
    render(<GrowthJournalEntryCard {...props} />)
    fireEvent.press(screen.getByTestId('growth-journal-preview-photo-1'))
    expect(props.onPhotoPress).toHaveBeenCalledWith('photo-1')
  })

  it('opens the viewer (not the journal) when the last tile is tapped', () => {
    const props = makeProps()
    render(<GrowthJournalEntryCard {...props} totalCount={10} />)
    fireEvent.press(screen.getByTestId('growth-journal-preview-photo-3'))
    expect(props.onPhotoPress).toHaveBeenCalledWith('photo-3')
    expect(props.onViewJournal).not.toHaveBeenCalled()
  })

  it('calls onViewJournal when "View all" is pressed', () => {
    const props = makeProps()
    render(<GrowthJournalEntryCard {...props} />)
    fireEvent.press(screen.getByTestId('growth-journal-view-all'))
    expect(props.onViewJournal).toHaveBeenCalled()
  })

  it('renders an empty state with an add-first-photo action and no "View all"', () => {
    render(
      <GrowthJournalEntryCard {...makeProps()} photos={[]} totalCount={0} />
    )
    expect(screen.getByTestId('growth-journal-empty')).toBeTruthy()
    expect(screen.getByTestId('growth-journal-add-first-photo')).toBeTruthy()
    expect(screen.queryByTestId('growth-journal-view-all')).toBeNull()
  })

  it('opens the photo source sheet when the add affordance is pressed', () => {
    render(<GrowthJournalEntryCard {...makeProps()} />)
    fireEvent.press(screen.getByTestId('growth-journal-add-photo'))
    expect(screen.getByText('Choose from gallery')).toBeTruthy()
  })
})
