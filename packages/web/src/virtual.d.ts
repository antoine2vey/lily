declare module 'virtual:post-index/*' {
  const posts: ReadonlyArray<import('@/lib/posts').PostMeta>
  export default posts
}
