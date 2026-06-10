// Converts a base64 VAPID public key to the Uint8Array format required by the browser
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  try {
    // Fetch the VAPID public key from the backend
    const res = await fetch('/api/push/vapid-public-key')
    const { key } = await res.json()
    if (!key) return

    const registration = await navigator.serviceWorker.ready

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      // Send it to backend in case the server restarted and lost the subscription
      await sendSubscriptionToServer(existing)
      return
    }

    // Request permission first
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })

    await sendSubscriptionToServer(subscription)
  } catch (err) {
    console.warn('Push subscription failed:', err)
  }
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    }),
  })
}
