import { useState, useEffect } from 'react'

interface CountdownState {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
}

export function useCountdown(targetDate: string | Date): CountdownState {
  const getRemaining = (): CountdownState => {
    const diff = new Date(targetDate).getTime() - Date.now()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
    const days    = Math.floor(diff / 86400000)
    const hours   = Math.floor((diff % 86400000) / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return { days, hours, minutes, seconds, expired: false }
  }

  const [state, setState] = useState<CountdownState>(getRemaining)

  useEffect(() => {
    if (state.expired) return
    const id = setInterval(() => setState(getRemaining()), 1000)
    return () => clearInterval(id)
  }, [targetDate, state.expired])

  return state
}

export function formatCountdown({ days, hours, minutes, expired }: CountdownState): string {
  if (expired) return 'Now'
  if (days > 0)    return `${days}d ${hours}h`
  if (hours > 0)   return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return 'Today'
}
