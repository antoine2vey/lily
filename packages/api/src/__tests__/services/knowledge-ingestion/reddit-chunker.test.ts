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
  it('should return parent with full thread and children with individual answers', () => {
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

    // Parent has full thread content
    expect(result.parent).toBeDefined()
    expect(result.parent?.content).toContain('Q: How do I water my monstera?')
    expect(result.parent?.content).toContain('I just got a new monstera')
    expect(result.parent?.content).toContain('---')
    expect(result.parent?.content).toContain('Top answers:')
    expect(result.parent?.content).toContain('[42 upvotes]')
    expect(result.parent?.content).toContain('[28 upvotes]')
    expect(result.parent?.metadata.chunkType).toBe('reddit_thread')
    expect(result.parent?.metadata.postScore).toBe(25)
    expect(result.parent?.metadata.subreddit).toBe('plantclinic')
    expect(result.parent?.metadata.commentCount).toBe(2)
    expect(result.parent?.metadata.topCommentScore).toBe(42)

    // Children are individual Q+A pairs
    expect(result.children).toHaveLength(2)
    expect(result.children[0]?.content).toContain(
      'Q: How do I water my monstera?'
    )
    expect(result.children[0]?.content).toContain('A:')
    expect(result.children[0]?.content).toContain('Water when the top')
    expect(result.children[0]?.metadata.chunkType).toBe('reddit_thread')
    expect(result.children[0]?.metadata.subreddit).toBe('plantclinic')
  })

  it('should sort children by comment score descending', () => {
    const result = chunkRedditDocument({
      title: 'Help with fern',
      content: 'My fern is drooping.',
      postScore: 10,
      subreddit: 'houseplants',
      comments: [
        makeComment({
          body: 'Low score comment about fern care and humidity.',
          score: 5,
        }),
        makeComment({
          body: 'High score comment with the best advice about fern care including misting.',
          score: 50,
        }),
        makeComment({
          body: 'Medium score comment about fern humidity needs and drainage.',
          score: 20,
        }),
      ],
    })

    expect(result.children).toHaveLength(3)
    // First child should be highest-scored comment
    expect(result.children[0]?.content).toContain('High score comment')
    expect(result.children[1]?.content).toContain('Medium score comment')
    expect(result.children[2]?.content).toContain('Low score comment')
  })

  it('should limit children to MAX_COMMENTS_PER_THREAD (5)', () => {
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

    expect(result.children).toHaveLength(5)
    expect(result.parent?.metadata.commentCount).toBe(5)
    // Parent should include top 5 comments
    expect(result.parent?.content).toContain('[100 upvotes]')
    expect(result.parent?.content).toContain('[60 upvotes]')
    expect(result.parent?.content).not.toContain('[50 upvotes]')
  })

  it('should preserve full content in parent without truncation', () => {
    const longBody = 'A'.repeat(5000)
    const longComment = 'B'.repeat(3000)

    const result = chunkRedditDocument({
      title: 'Long post',
      content: longBody,
      postScore: 10,
      subreddit: 'plantclinic',
      comments: [makeComment({ body: longComment, score: 15 })],
    })

    expect(result.parent?.content).toContain(longBody)
    expect(result.parent?.content).toContain(longComment)
  })

  it('should return single child with no parent when no comments', () => {
    const result = chunkRedditDocument({
      title: 'Why is my cactus soft?',
      content: 'My cactus feels mushy at the base.',
      postScore: 8,
      subreddit: 'succulents',
      comments: [],
    })

    expect(result.parent).toBeUndefined()
    expect(result.children).toHaveLength(1)
    expect(result.children[0]?.content).toBe(
      'Q: Why is my cactus soft?\n\nMy cactus feels mushy at the base.'
    )
    expect(result.children[0]?.metadata.chunkType).toBe('reddit_question_only')
    expect(result.children[0]?.metadata.commentCount).toBe(0)
    expect(result.children[0]?.metadata.topCommentScore).toBe(0)
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

    expect(result.parent).toBeDefined()
    expect(result.parent?.content).toContain('Q: Best soil for pothos?')
    expect(result.parent?.content).not.toContain('\n\nQ:')
    expect(result.parent?.content).toContain('[30 upvotes]')
    expect(result.parent?.metadata.chunkType).toBe('reddit_thread')

    expect(result.children).toHaveLength(1)
    expect(result.children[0]?.content).toContain('Q: Best soil for pothos?')
    expect(result.children[0]?.content).toContain('A:')
  })

  it('should format child content as Q+A pair', () => {
    const result = chunkRedditDocument({
      title: 'Watering frequency for snake plant',
      content:
        'I water my snake plant once a week but the leaves are turning yellow.',
      postScore: 15,
      subreddit: 'plantclinic',
      comments: [
        makeComment({
          body: 'Snake plants are susceptible to overwatering. Water only when the soil is completely dry.',
          score: 20,
        }),
      ],
    })

    expect(result.children[0]?.content).toBe(
      'Q: Watering frequency for snake plant\n\nA: Snake plants are susceptible to overwatering. Water only when the soil is completely dry.'
    )
  })
})
