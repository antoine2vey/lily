import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/components/AuthGate'
import { Layout } from '@/components/Layout'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { GiftCodeFormPage } from '@/pages/GiftCodeFormPage'
import { GiftCodesPage } from '@/pages/GiftCodesPage'
import { GiftHistoryPage } from '@/pages/GiftHistoryPage'
import { GiftSubscriptionPage } from '@/pages/GiftSubscriptionPage'
import { JobsPage } from '@/pages/JobsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NewJobPage } from '@/pages/NewJobPage'
import { PromptPreviewPage } from '@/pages/PromptPreviewPage'
import { SearchPage } from '@/pages/SearchPage'

const queryClient = new QueryClient()

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
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
            <Route path="/gift-codes/:id/edit" element={<GiftCodeFormPage />} />
            <Route path="/gift-history" element={<GiftHistoryPage />} />
            <Route path="/prompt-preview" element={<PromptPreviewPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
)
