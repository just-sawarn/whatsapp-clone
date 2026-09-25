/**
 * Registers the service worker in production builds only. In development it would sit between Vite and the
 * browser, so any worker left over from an earlier build is removed instead.
 */
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  if (!import.meta.env.PROD) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    )
    return null
  }
  return navigator.serviceWorker.register('/sw.js')
}

export function notificationPermission():
  NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

/**
 * Shows a browser notification while the tab is in the background. The body is built on this device from
 * the already-decrypted message, so plaintext never travels through a push service.
 */
export function showNotification(
  title: string,
  body: string,
  tag: string,
  onClick?: () => void,
): void {
  if (
    notificationPermission() !== 'granted' ||
    document.visibilityState === 'visible'
  )
    return
  const notification = new Notification(title, { body, tag, silent: true })
  notification.onclick = () => {
    window.focus()
    notification.close()
    onClick?.()
  }
}

// ------------------------------------------------------------------ Web Push (background delivery)

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  string | undefined
export const pushConfigured = Boolean(vapidPublicKey)

function urlBase64ToBytes(value: string): Uint8Array {
  const padded = value
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

/** Subscribes this browser to Web Push and returns the subscription to store in `push_subscriptions`. */
export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  if (!vapidPublicKey || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(vapidPublicKey),
    }))
  return subscription.toJSON()
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}
