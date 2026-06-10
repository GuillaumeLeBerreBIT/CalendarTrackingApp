import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import ProtectedRoute from '@/components/ProtectedRoute'
import OnboardingFlow from '@/components/OnboardingFlow'
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
import TimersPage from '@/pages/TimersPage'
import { useAuthStore } from '@/store/authStore'
import { subscribeToPush } from '@/lib/pushNotifications'

// ── Inner app — reads auth store after ProtectedRoute has populated it ────────
function AppInner() {
  const { user } = useAuthStore()

  // Silently subscribe to push once the user is authenticated.
  // subscribeToPush() is idempotent — it checks for an existing subscription first.
  useEffect(() => {
    if (user) subscribeToPush()
  }, [user])

  // Show onboarding only when the field is explicitly false (new users).
  // undefined or true means existing/completed user → skip wizard.
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (user?.hasCompletedOnboarding === false) {
      setShowOnboarding(true)
    }
  }, [user])

  return (
    <>
      {showOnboarding && (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
      )}

      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/join/:token" element={<JoinGroupPage />} />
        <Route path="/e/:eventId" element={<PublicEventPage />} />

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
          <Route path="/timers" element={<TimersPage />} />
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
