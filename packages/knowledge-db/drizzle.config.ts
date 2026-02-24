import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.KNOWLEDGE_DATABASE_URL ?? '',
  },
})
