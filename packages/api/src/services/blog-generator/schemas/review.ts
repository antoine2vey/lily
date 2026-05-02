import { z } from 'zod'

export const ReviewSchema = z.object({
  uniqueness: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Originality vs source phrasing. Apply the calibration in the system prompt: 88-92 is the target for a competently rewritten post. Technical-term overlap with sources is not a deduction.'
    ),
  organicFeel: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'How human the prose reads. 88-92 is the target for natural, varied writing without obvious AI tells. 100 is unattainable.'
    ),
  factualAccuracy: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Correctness of plant care claims. 88-92 is the target for accurate content. Only deduct below 88 for actual inaccuracies, not for claims absent from sources but consistent with standard horticulture.'
    ),
  seoQuality: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Heading structure + internal linking. Start from 92, apply the mechanical deductions in the system prompt for missing/broken/over-linked links and missing headings. Floor at 60.'
    ),
  contentDepth: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Word count + depth signals. Use the exact word-count rubric in the system prompt (e.g. 1500-1799 words = 88, 1800-2199 = 92), then ±3 for seasonal/troubleshooting/measurements/comparisons.'
    ),
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Weighted: uniqueness 30%, organicFeel 25%, factualAccuracy 20%, seoQuality 10%, contentDepth 15%. Publication threshold is 88 on the four quality dimensions and 80 on contentDepth.'
    ),
  feedback: z
    .string()
    .describe(
      'Actionable critique explaining what needs improvement. Be specific about which sentences or sections are problematic.'
    ),
})
