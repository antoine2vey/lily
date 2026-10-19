import { Duration } from 'effect'

// Blog generation is disabled in production, so there is no latency data for
// these calls. The values assume ~50 tokens/s for gpt-4o and ~80 tokens/s for
// gpt-4o-mini, with roughly 3x headroom on the expected output size. The job
// runs in a background scheduler, so a long deadline costs nothing.
export const BLOG_OPENAI_TIMEOUTS = {
  topicSelection: Duration.seconds(60),
  research: Duration.seconds(120),
  // gpt-4o writing a full post (~3,000 output tokens)
  content: Duration.minutes(3),
  // gpt-4o-mini rewriting the full post in another language
  translation: Duration.minutes(3),
  review: Duration.seconds(60),
} as const
