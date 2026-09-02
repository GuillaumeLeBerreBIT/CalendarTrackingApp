// Converts a base64 VAPID public key to the Uint8Array format required by the browser
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export type PushFailureReason =
  | 'unsupported'        // no ServiceWorker / PushManager / Notification API (e.g. iOS Safari tab, not installed)
  | 'insecure-context'   // page not served over HTTPS (or localhost)
  | 'permission-denied'  // user has blocked notifications for this origin
  | 'permission-dismissed' // prompt shown but not answered (or called outside a user gesture on Safari)
  | 'no-vapid-key'       // backend returned an empty VAPID public key — server env not configured
  | 'subscribe-failed'   // pushManager.subscribe() threw (bad key, push service unreachable…)
  | 'server-failed'      // saving the subscription to our backend failed

export type PushResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; reason: PushFailureReason; detail?: string }

/**
 * Subscribe this device to web push. Safe to call repeatedly — it reuses an
 * existing subscription and only prompts for permission when needed.
 *
 * IMPORTANT: on Safari / iOS the permission prompt is only shown when this runs
 * inside a user gesture (a click handler). Calling it from an effect on page
 * load will resolve as 'permission-dismissed' without ever showing a prompt, so
 * the auto-call in App.tsx is guarded to only run when permission is already
 * granted. Drive the first opt-in from the "Enable" button in ProfilePage.
 */
export async function subscribeToPush(): Promise<PushResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    return { ok: false, reason: 'insecure-context' }
  }

  try {
    const registration = await navigator.serviceWorker.ready

    // Already subscribed → just make sure the backend still has it (it may have
    // lost the row on a redeploy / DB reset) and we're done.
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      try {
        await sendSubscriptionToServer(existing)
      } catch (err) {
        return { ok: false, reason: 'server-failed', detail: errMessage(err) }
      }
      return { ok: true, alreadySubscribed: true }
    }

    // Ask for permission before any network round-trip so the call still counts
    // as happening inside the originating user gesture on Safari/iOS.
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission === 'denied') return { ok: false, reason: 'permission-denied' }
    if (permission !== 'granted') return { ok: false, reason: 'permission-dismissed' }

    const res = await fetch('/api/push/vapid-public-key')
    const { key } = (await res.json()) as { key?: string }
    if (!key) return { ok: false, reason: 'no-vapid-key' }

    let subscription: PushSubscription
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
    } catch (err) {
      return { ok: false, reason: 'subscribe-failed', detail: errMessage(err) }
    }

    try {
      await sendSubscriptionToServer(subscription)
    } catch (err) {
      return { ok: false, reason: 'server-failed', detail: errMessage(err) }
    }

    return { ok: true, alreadySubscribed: false }
  } catch (err) {
    return { ok: false, reason: 'subscribe-failed', detail: errMessage(err) }
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    }),
  })
  if (!res.ok) throw new Error(`POST /api/push/subscribe → ${res.status}`)
}
