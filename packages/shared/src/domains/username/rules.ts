import { Option, String } from 'effect'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/

// Handles that would read as Lily staff or system accounts
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'account',
  'admin',
  'administrator',
  'api',
  'demo',
  'help',
  'info',
  'lily',
  'me',
  'mod',
  'moderator',
  'null',
  'official',
  'root',
  'security',
  'staff',
  'support',
  'system',
  'team',
  'test',
  'undefined',
  'user',
  'withlily',
  'www',
])

/** Why `username` (already trimmed) can't be a handle, if it can't. */
export const usernameProblem = (username: string): Option.Option<string> => {
  if (!USERNAME_PATTERN.test(username)) {
    return Option.some(
      'Username must be 3 to 30 letters, numbers, or underscores'
    )
  }
  if (RESERVED_USERNAMES.has(String.toLowerCase(username))) {
    return Option.some('This username is reserved')
  }
  return Option.none()
}
