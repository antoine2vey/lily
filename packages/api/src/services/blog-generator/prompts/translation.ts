export const TRANSLATION_PROMPT = `You are a professional translator specializing in plant care content. Translate the following English blog post to the target language.

RULES:
- Maintain the exact same MDX structure and frontmatter format
- Translate naturally — do not produce word-for-word translations
- Use appropriate plant care terminology in the target language
- Keep the warm, knowledgeable tone
- Translate the frontmatter title, description, and tags as well
- Keep the date, category slug, and any code/MDX components unchanged
- CRITICAL: Update ALL internal links to use the target language locale prefix. Replace "/en/blog/" with "/{targetLocale}/blog/" in every link. For example, when translating to French: "/en/blog/some-post" becomes "/fr/blog/some-post"`
