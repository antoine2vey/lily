import type { RedditCommentData } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import { chunkRedditDocument } from '@lily/api/services/knowledge-ingestion/processing/reddit-chunker'
import { describe, expect, it } from 'vitest'

const makeComment = (
  overrides: Partial<RedditCommentData> = {}
): RedditCommentData => ({
  body: 'This is a helpful comment about plant care that provides detailed advice on watering techniques and soil conditions for optimal growth.',
  author: 'plantlover42',
  score: 10,
  ...overrides,
})

describe('chunkRedditDocument', () => {
  it('should create a single consolidated chunk from a thread with comments', () => {
    const result = chunkRedditDocument({
      title: 'How do I water my monstera?',
      content: 'I just got a new monstera and need watering advice.',
      postScore: 25,
      subreddit: 'plantclinic',
      comments: [
        makeComment({
          body: 'Water when the top 2 inches of soil are dry. Monsteras prefer to dry out between waterings, especially in winter months.',
          score: 42,
        }),
        makeComment({
          body: 'I use a moisture meter and water when it reads 3-4. Much more reliable than the finger test for deeper pots.',
          score: 28,
        }),
      ],
    })

    expect(result.content).toContain('Q: How do I water my monstera?')
    expect(result.content).toContain('I just got a new monstera')
    expect(result.content).toContain('---')
    expect(result.content).toContain('Top answers:')
    expect(result.content).toContain('[42 upvotes]')
    expect(result.content).toContain('[28 upvotes]')
    expect(result.metadata.chunkType).toBe('reddit_thread')
    expect(result.metadata.postScore).toBe(25)
    expect(result.metadata.subreddit).toBe('plantclinic')
    expect(result.metadata.commentCount).toBe(2)
    expect(result.metadata.topCommentScore).toBe(42)
  })

  it('should sort comments by score descending', () => {
    const result = chunkRedditDocument({
      title: 'Help with fern',
      content: 'My fern is drooping.',
      postScore: 10,
      subreddit: 'houseplants',
      comments: [
        makeComment({
          body: 'Low score comment that still provides some useful information about fern care and humidity requirements.',
          score: 5,
        }),
        makeComment({
          body: 'High score comment with the best advice about fern care including misting and indirect light placement.',
          score: 50,
        }),
        makeComment({
          body: 'Medium score comment about fern humidity needs and the importance of proper drainage in the potting mix.',
          score: 20,
        }),
      ],
    })

    const lines = result.content.split('\n')
    const upvoteLines = lines.filter((l: string) => l.includes('upvotes]'))
    expect(upvoteLines[0]).toContain('[50 upvotes]')
    expect(upvoteLines[1]).toContain('[20 upvotes]')
    expect(upvoteLines[2]).toContain('[5 upvotes]')
  })

  it('should limit to MAX_COMMENTS_PER_THREAD (5)', () => {
    const comments = globalThis.Array.from({ length: 8 }, (_, i) =>
      makeComment({
        body: `Comment number ${i + 1} about plant care with enough detail to pass the minimum length requirement for inclusion.`,
        score: 100 - i * 10,
      })
    )

    const result = chunkRedditDocument({
      title: 'Many comments',
      content: 'Post with lots of discussion.',
      postScore: 50,
      subreddit: 'gardening',
      comments,
    })

    expect(result.metadata.commentCount).toBe(5)
    // Should have top 5 scores: 100, 90, 80, 70, 60
    expect(result.content).toContain('[100 upvotes]')
    expect(result.content).toContain('[60 upvotes]')
    expect(result.content).not.toContain('[50 upvotes]')
  })

  it('should preserve full content without truncation', () => {
    const longBody = 'A'.repeat(5000)
    const longComment = 'B'.repeat(3000)

    const result = chunkRedditDocument({
      title: 'Long post',
      content: longBody,
      postScore: 10,
      subreddit: 'plantclinic',
      comments: [makeComment({ body: longComment, score: 15 })],
    })

    expect(result.content).toContain(longBody)
    expect(result.content).toContain(longComment)
  })

  it('should create question-only chunk when no comments', () => {
    const result = chunkRedditDocument({
      title: 'Why is my cactus soft?',
      content: 'My cactus feels mushy at the base.',
      postScore: 8,
      subreddit: 'succulents',
      comments: [],
    })

    expect(result.content).toBe(
      'Q: Why is my cactus soft?\n\nMy cactus feels mushy at the base.'
    )
    expect(result.content).not.toContain('---')
    expect(result.content).not.toContain('Top answers:')
    expect(result.metadata.chunkType).toBe('reddit_question_only')
    expect(result.metadata.commentCount).toBe(0)
    expect(result.metadata.topCommentScore).toBe(0)
  })

  it('should handle post with no selftext (title-only question)', () => {
    const result = chunkRedditDocument({
      title: 'Best soil for pothos?',
      content: '',
      postScore: 12,
      subreddit: 'houseplants',
      comments: [
        makeComment({
          body: 'A well-draining potting mix with perlite works great for pothos plants. They are not too picky about soil.',
          score: 30,
        }),
      ],
    })

    expect(result.content).toContain('Q: Best soil for pothos?')
    expect(result.content).not.toContain('\n\nQ:')
    expect(result.content).toContain('[30 upvotes]')
    expect(result.metadata.chunkType).toBe('reddit_thread')
  })

  it('should build fallback embedding text from title + body excerpt', () => {
    const result = chunkRedditDocument({
      title: 'Watering frequency for snake plant',
      content:
        'I water my snake plant once a week but the leaves are turning yellow.',
      postScore: 15,
      subreddit: 'plantclinic',
      comments: [],
    })

    expect(result.embeddingText).toBe(
      'Watering frequency for snake plant. I water my snake plant once a week but the leaves are turning yellow.'
    )
  })

  it('should use only title for embedding text when no selftext', () => {
    const result = chunkRedditDocument({
      title: 'How often to fertilize fiddle leaf fig?',
      content: '',
      postScore: 10,
      subreddit: 'houseplants',
      comments: [],
    })

    expect(result.embeddingText).toBe('How often to fertilize fiddle leaf fig?')
  })

  it('should truncate body to 200 chars in fallback embedding text', () => {
    const longBody = 'A'.repeat(500)

    const result = chunkRedditDocument({
      title: 'Test',
      content: longBody,
      postScore: 10,
      subreddit: 'test',
      comments: [],
    })

    expect(result.embeddingText).toBe(`Test. ${'A'.repeat(200)}`)
  })
})
