import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import ProtectedRoute from '@/components/ProtectedRoute'
import OnboardingWizard from '@/components/OnboardingWizard'
import UpgradeModal from '@/components/UpgradeModal'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import DiscoveryPage from '@/pages/DiscoveryPage'
import CalendarPage from '@/pages/CalendarPage'
import GroupsPage from '@/pages/GroupsPage'
import GroupDetailPage from '@/pages/GroupDetailPage'
import TodoPage from '@/pages/TodoPage'
import ProfilePage from '@/pages/ProfilePage'
import NotificationsPage from '@/pages/NotificationsPage'
import PricingPage from '@/pages/PricingPage'
import JoinGroupPage from '@/pages/JoinGroupPage'
import PublicEventPage from '@/pages/PublicEventPage'
import HabitsPage from '@/pages/HabitsPage'
import CountdownsPage from '@/pages/CountdownsPage'
import { useAuthStore } from '@/store/authStore'
import { subscribeToPush } from '@/lib/pushNotifications'

// DEV-only harness — not bundled in production
const MobileCalendarHarness = import.meta.env.DEV
  ? lazy(() => import('@/pages/dev/MobileCalendarHarness'))
  : null

// ── Inner app — reads auth store after ProtectedRoute has populated it ────────
function AppInner() {
  const { user } = useAuthStore()

  // Silently subscribe to push once the user is authenticated.
  // subscribeToPush() is idempotent — it checks for an existing subscription first.
  useEffect(() => {
    if (user) subscribeToPush()
  }, [user])

  // Show onboarding only when auth is resolved (user !== null) and the flag is
  // explicitly false — never flashes for logged-out users or while fetchMe is
  // pending. The wizard flips the flag in the auth store on completion/skip,
  // which unmounts it here without a reload.
  const showOnboarding = !!user && user.hasCompletedOnboarding === false

  return (
    <>
      {showOnboarding && <OnboardingWizard />}
      <UpgradeModal />

      <Routes>
        {/* DEV-only harness */}
        {import.meta.env.DEV && MobileCalendarHarness && (
          <Route
            path="/dev/mobile-calendar"
            element={
              <Suspense fallback={<div style={{ color: 'var(--text-3)', padding: 24 }}>Loading dev harness…</div>}>
                <MobileCalendarHarness />
              </Suspense>
            }
          />
        )}

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/join/:token" element={<JoinGroupPage />} />
        <Route path="/e/:token" element={<PublicEventPage />} />

        {/* Protected — wrapped in AppShell */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<CalendarPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route path="/todo" element={<TodoPage />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/countdowns" element={<CountdownsPage />} />
          {/* Legacy route — old bookmarks/notification links */}
          <Route path="/timers" element={<Navigate to="/countdowns" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
