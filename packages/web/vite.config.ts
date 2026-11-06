import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { Array } from 'effect'
import { defineConfig } from 'vite'
import { siteUrls } from './src/lib/sitemap'
import { loadPostIndex, postsPlugin } from './vite/posts'

const pages = [
  '/',
  '/join',
  '/sitemap.xml',
  '/robots.txt',
  ...Array.map(
    siteUrls(loadPostIndex),
    ({ locale, path }) => `/${locale}${path}`
  ),
]

export default defineConfig({
  server: { port: 3001 },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    postsPlugin(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        autoSubfolderIndex: false,
        crawlLinks: false,
        failOnError: true,
        concurrency: 16,
      },
      pages: Array.map(pages, (path) => ({ path })),
    }),
    react(),
  ],
})
