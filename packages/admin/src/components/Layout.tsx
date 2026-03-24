import { Array, pipe } from 'effect'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLogout } from '@/hooks/use-auth'

const navItems = [
  { path: '/jobs', label: 'Jobs' },
  { path: '/jobs/new', label: 'New Job' },
  { path: '/search', label: 'Search' },
  { path: '/gift-subscription', label: 'Gift Sub' },
  { path: '/gift-history', label: 'Gift History' },
  { path: '/prompt-preview', label: 'Prompt Preview' },
] as const

export const Layout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const logout = useLogout()

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate('/login'),
    })
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-4">
          <h1 className="text-lg font-semibold text-primary-600">Lily Admin</h1>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {pipe(
            navItems,
            Array.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })
          )}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
