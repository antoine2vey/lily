-- Separate the text used for embedding from the stored content.
-- embedding_content holds keyword-enriched text (what gets embedded).
-- content holds clean text (what the LLM sees).
ALTER TABLE "processed_chunks"
  ADD COLUMN "embedding_content" text;
