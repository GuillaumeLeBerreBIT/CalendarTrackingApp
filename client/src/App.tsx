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
import { useAuthStore } from '@/store/authStore'

// ── Inner app — reads auth store after ProtectedRoute has populated it ────────
function AppInner() {
  const { user } = useAuthStore()

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
          <Route index element={<DiscoveryPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route path="/todo" element={<TodoPage />} />
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
