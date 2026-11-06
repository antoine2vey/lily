import { createFileRoute } from '@tanstack/react-router'
import { BlogIndexPage, blogIndexHead } from '@/components/blog/BlogIndexPage'
import { paginatePosts } from '@/lib/blog-pagination'

export const Route = createFileRoute('/$locale/blog/')({
  loader: async ({ params }) =>
    paginatePosts(
      await (await import('@/lib/post-data')).postIndex(params.locale),
      1
    ),
  head: ({ params, loaderData }) =>
    loaderData ? blogIndexHead(params.locale, loaderData) : {},
  component: () => <BlogIndexPage page={Route.useLoaderData()} />,
})
