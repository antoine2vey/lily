import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/components/AuthGate'
import { Layout } from '@/components/Layout'

// Route-level code splitting: each page is its own chunk, so heavy deps like
// Recharts (only used by AnalyticsPage) don't ship to clients on other routes.
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
)
const GiftCodeFormPage = lazy(() =>
  import('@/pages/GiftCodeFormPage').then((m) => ({
    default: m.GiftCodeFormPage,
  }))
)
const GiftCodesPage = lazy(() =>
  import('@/pages/GiftCodesPage').then((m) => ({ default: m.GiftCodesPage }))
)
const GiftHistoryPage = lazy(() =>
  import('@/pages/GiftHistoryPage').then((m) => ({
    default: m.GiftHistoryPage,
  }))
)
const GiftSubscriptionPage = lazy(() =>
  import('@/pages/GiftSubscriptionPage').then((m) => ({
    default: m.GiftSubscriptionPage,
  }))
)
const JobsPage = lazy(() =>
  import('@/pages/JobsPage').then((m) => ({ default: m.JobsPage }))
)
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const NewJobPage = lazy(() =>
  import('@/pages/NewJobPage').then((m) => ({ default: m.NewJobPage }))
)
const PromptPreviewPage = lazy(() =>
  import('@/pages/PromptPreviewPage').then((m) => ({
    default: m.PromptPreviewPage,
  }))
)
const SearchPage = lazy(() =>
  import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage }))
)

const queryClient = new QueryClient()

const RouteFallback = () => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500">
    Loading…
  </div>
)

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthGate />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/analytics" replace />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/new" element={<NewJobPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route
                path="/gift-subscription"
                element={<GiftSubscriptionPage />}
              />
              <Route path="/gift-codes" element={<GiftCodesPage />} />
              <Route path="/gift-codes/new" element={<GiftCodeFormPage />} />
              <Route
                path="/gift-codes/:id/edit"
                element={<GiftCodeFormPage />}
              />
              <Route path="/gift-history" element={<GiftHistoryPage />} />
              <Route path="/prompt-preview" element={<PromptPreviewPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </QueryClientProvider>
)
