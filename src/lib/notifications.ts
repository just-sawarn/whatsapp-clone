export async function registerNotificationServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  await navigator.serviceWorker.register('/sw.js')
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export function notifyNewMessage(senderName: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
  new Notification(`New message from ${senderName}`, { body: 'Open WhatsApp to read it.', tag: 'whatsapp-message' })
}
