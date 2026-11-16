import { createRouter, type LocationRewrite } from '@tanstack/react-router'
import { Option } from 'effect'
import { routeTree } from './routeTree.gen'

const JOIN_PAGE = '/join'
// Not `String.startsWith` from effect: in this entry module it reshuffles the chunks past the `page-bytes.ts` file budget.
const isInvitePath = (pathname: string) => pathname.startsWith(`${JOIN_PAGE}/`)

// One prerendered page answers every /join/<token> path (the `/join/` location in `nginx.conf`), so the router has to
// read such a path as /join to hydrate that page. `output` gives the path back, or the dev server redirects to /join.
const joinRewrite = (): LocationRewrite => {
  let invitePath = Option.none<string>()
  return {
    input: ({ url }) => {
      if (isInvitePath(url.pathname)) {
        invitePath = Option.some(url.pathname)
        url.pathname = JOIN_PAGE
      }
      return url
    },
    output: ({ url }) => {
      if (url.pathname === JOIN_PAGE && Option.isSome(invitePath))
        url.pathname = invitePath.value
      return url
    },
  }
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    rewrite: joinRewrite(),
  })
}
