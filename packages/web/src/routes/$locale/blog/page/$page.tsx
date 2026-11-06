import { createFileRoute, notFound } from '@tanstack/react-router'
import { BlogIndexPage, blogIndexHead } from '@/components/blog/BlogIndexPage'
import { paginatePosts, totalPages } from '@/lib/blog-pagination'

export const Route = createFileRoute('/$locale/blog/page/$page')({
  loader: async ({ params }) => {
    const posts = await (await import('@/lib/post-data')).postIndex(
      params.locale
    )
    const page = Number(params.page)
    // Page 1 lives at /blog, so /blog/page/1 is not a URL.
    if (!Number.isInteger(page) || page < 2 || page > totalPages(posts))
      throw notFound()
    return paginatePosts(posts, page)
  },
  head: ({ params, loaderData }) =>
    loaderData ? blogIndexHead(params.locale, loaderData) : {},
  component: () => <BlogIndexPage page={Route.useLoaderData()} />,
})
