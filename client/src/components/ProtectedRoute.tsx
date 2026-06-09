import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, fetchMe } = useAuthStore()
  const [ready, setReady] = useState(false)
  const didFetch = useRef(false)

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true
    fetchMe().finally(() => setReady(true))
  }, [fetchMe])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
