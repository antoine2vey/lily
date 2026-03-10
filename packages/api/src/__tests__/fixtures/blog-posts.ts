import type { BlogPost } from '@lily/api/repositories/blog-post.repository'

export const mockBlogPost1: BlogPost = {
  id: 'blog-1',
  slug: 'how-to-water-succulents',
  title: {
    en: 'How to Water Succulents',
    fr: 'Comment arroser les succulentes',
  },
  category: 'care-guide',
  tags: ['succulents', 'watering', 'beginner'],
  status: 'published',
  sources: [
    {
      url: 'https://example.com/succulent-care',
      title: 'Succulent Care Guide',
      snippet: 'Water deeply but infrequently',
    },
  ],
  content: {
    en: '# How to Water Succulents\n\nContent here...',
    fr: '# Comment arroser les succulentes\n\nContenu ici...',
  },
  reviewScore: 97,
  reviewFeedback: 'Excellent quality',
  retryCount: 0,
  publishedAt: new Date('2026-03-05T10:00:00Z'),
  commitShas: { en: 'abc123', fr: 'def456' },
  createdAt: new Date('2026-03-05T08:00:00Z'),
  updatedAt: new Date('2026-03-05T10:00:00Z'),
}

export const mockBlogPost2: BlogPost = {
  id: 'blog-2',
  slug: 'indoor-plants-low-light',
  title: {
    en: 'Best Indoor Plants for Low Light',
    fr: 'Meilleures plantes pour faible luminosité',
  },
  category: 'plant-profile',
  tags: ['indoor', 'low-light', 'beginner'],
  status: 'published',
  sources: [],
  content: {
    en: '# Best Indoor Plants\n\nContent here...',
    fr: '# Meilleures plantes\n\nContenu ici...',
  },
  reviewScore: 96,
  reviewFeedback: 'Good quality',
  retryCount: 0,
  publishedAt: new Date('2026-03-07T10:00:00Z'),
  commitShas: { en: 'ghi789', fr: 'jkl012' },
  createdAt: new Date('2026-03-07T08:00:00Z'),
  updatedAt: new Date('2026-03-07T10:00:00Z'),
}

export const mockPendingBlogPost: BlogPost = {
  id: 'blog-3',
  slug: 'propagation-basics',
  title: {
    en: 'Plant Propagation Basics',
    fr: 'Bases de la propagation des plantes',
  },
  category: 'how-to',
  tags: ['propagation', 'beginner'],
  status: 'pending',
  sources: [],
  content: null,
  reviewScore: null,
  reviewFeedback: null,
  retryCount: 0,
  publishedAt: null,
  commitShas: null,
  createdAt: new Date('2026-03-10T08:00:00Z'),
  updatedAt: new Date('2026-03-10T08:00:00Z'),
}

export const mockRejectedBlogPost: BlogPost = {
  id: 'blog-4',
  slug: 'pest-control-guide',
  title: {
    en: 'Natural Pest Control',
    fr: 'Lutte antiparasitaire naturelle',
  },
  category: 'troubleshooting',
  tags: ['pests', 'organic'],
  status: 'rejected',
  sources: [],
  content: {
    en: '# Pest Control\n\nContent...',
    fr: '# Lutte antiparasitaire\n\nContenu...',
  },
  reviewScore: 72,
  reviewFeedback: 'Too similar to sources',
  retryCount: 3,
  publishedAt: null,
  commitShas: null,
  createdAt: new Date('2026-03-09T08:00:00Z'),
  updatedAt: new Date('2026-03-09T12:00:00Z'),
}

export const mockBlogPosts = [
  mockBlogPost1,
  mockBlogPost2,
  mockPendingBlogPost,
  mockRejectedBlogPost,
]
