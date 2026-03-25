import { z } from 'zod'

export const ReviewSchema = z.object({
  uniqueness: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'How original the content is compared to source material. 100 = completely rephrased, 0 = copied verbatim.'
    ),
  organicFeel: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'How natural and human-written the content reads. 100 = indistinguishable from a human expert, 0 = obviously AI-generated.'
    ),
  factualAccuracy: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Whether the plant care advice is scientifically correct and safe to follow. 100 = fully accurate, 0 = contains dangerous misinformation.'
    ),
  seoQuality: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'SEO readiness: proper heading structure, keyword usage, meta-friendly intro, internal linking opportunities. 100 = perfectly optimized.'
    ),
  contentDepth: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Content depth and word count. Score 0 if under 1200 words, 50 if 1200-1499, 80+ only if 1500+. Also evaluates seasonal variations, troubleshooting tips, specific measurements, and species comparisons.'
    ),
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Weighted overall quality score: uniqueness (30%), organicFeel (25%), factualAccuracy (20%), seoQuality (10%), contentDepth (15%). Must be >= 93 for publication.'
    ),
  feedback: z
    .string()
    .describe(
      'Actionable critique explaining what needs improvement. Be specific about which sentences or sections are problematic.'
    ),
})
